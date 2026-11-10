import { Pool } from "pg";
import type { Plot } from "../geo";

/**
 * PostgreSQL access for persisting uploaded plots. The connection string comes
 * from DATABASE_URL (e.g. postgres://user:pass@host:5432/locanix). A single Pool
 * is cached on globalThis so dev HMR doesn't open a new pool on every reload.
 */
declare global {
  // eslint-disable-next-line no-var
  var _locanixPgPool: Pool | undefined;
}

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!global._locanixPgPool) {
    global._locanixPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
  }
  return global._locanixPgPool;
}

let schemaReady: Promise<void> | null = null;

/** Create the `plots` table on first use (idempotent). */
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS plots (
          id          BIGSERIAL PRIMARY KEY,
          user_uid    TEXT,
          user_email  TEXT,
          plot_id     TEXT,
          name        TEXT NOT NULL,
          area_ha     DOUBLE PRECISION NOT NULL DEFAULT 0,
          is_valid    BOOLEAN NOT NULL DEFAULT TRUE,
          issues      JSONB NOT NULL DEFAULT '[]'::jsonb,
          geometry    JSONB NOT NULL,
          source      TEXT,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS plots_user_email_idx ON plots (user_email);
        CREATE INDEX IF NOT EXISTS plots_created_at_idx ON plots (created_at DESC);
      `)
      .then(() => undefined)
      .catch((e) => {
        schemaReady = null; // allow a later retry
        throw e;
      });
  }
  return schemaReady;
}

export type SavePlotInput = {
  plotId: string;
  name: string;
  areaHa: number;
  isValid: boolean;
  issues: string[];
  ring: [number, number][];
};

const closedRing = (ring: [number, number][]) =>
  ring.length >= 3 ? [...ring, ring[0]] : ring;

/** Persist a batch of uploaded plots for a user. Returns the number stored. */
export async function savePlots(
  user: { uid: string; email: string },
  plots: SavePlotInput[],
  source: string,
): Promise<number> {
  if (plots.length === 0) return 0;
  await ensureSchema();

  const COLS = 9;
  const params: unknown[] = [];
  const tuples = plots.map((p, i) => {
    const o = i * COLS;
    params.push(
      user.uid,
      user.email,
      p.plotId,
      p.name,
      p.areaHa,
      p.isValid,
      JSON.stringify(p.issues ?? []),
      JSON.stringify({ type: "Polygon", coordinates: [closedRing(p.ring)] }),
      source,
    );
    return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7}::jsonb,$${o + 8}::jsonb,$${o + 9})`;
  });

  await getPool().query(
    `INSERT INTO plots
       (user_uid, user_email, plot_id, name, area_ha, is_valid, issues, geometry, source)
     VALUES ${tuples.join(",")}`,
    params,
  );
  return plots.length;
}

/* -------------------------------------------------------------------------- */
/*  Workspaces: each user's current plots with their EUDR results              */
/* -------------------------------------------------------------------------- */

export const hasDatabase = () => Boolean(process.env.DATABASE_URL);

let workspaceSchemaReady: Promise<void> | null = null;

/**
 * `workspaces` holds one row per user; `workspace_plots` one row per plot with the
 * geometry, workspace status and analysis results (summary columns for querying,
 * plus the full result in `eudr`). Created on first use (idempotent).
 */
function ensureWorkspaceSchema(): Promise<void> {
  if (!workspaceSchemaReady) {
    workspaceSchemaReady = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS workspaces (
          user_uid    TEXT PRIMARY KEY,
          user_email  TEXT,
          eudr_done   BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS workspace_plots (
          user_uid           TEXT NOT NULL REFERENCES workspaces (user_uid) ON DELETE CASCADE,
          local_id           INTEGER NOT NULL,
          position           INTEGER NOT NULL,
          plot_id            TEXT,
          name               TEXT NOT NULL,
          area_ha            DOUBLE PRECISION NOT NULL,
          is_valid           BOOLEAN NOT NULL,
          checks             JSONB NOT NULL,
          issues             JSONB NOT NULL DEFAULT '[]'::jsonb,
          geometry           JSONB NOT NULL,
          status             TEXT NOT NULL,
          deforestation_risk TEXT,
          loss_ha            DOUBLE PRECISION,
          wdpa_status        TEXT,
          wdpa_categories    JSONB,
          eudr               JSONB,
          PRIMARY KEY (user_uid, local_id)
        );
        CREATE INDEX IF NOT EXISTS workspace_plots_status_idx ON workspace_plots (status);
      `)
      .then(() => undefined)
      .catch((e) => {
        workspaceSchemaReady = null;
        throw e;
      });
  }
  return workspaceSchemaReady;
}

/** Same rules as lib/plotStatus.ts: clear | review | pending | invalid. */
function statusOf(p: Plot): string {
  if (!p.isValid) return "invalid";
  if (!p.eudr) return "pending";
  const loss = (p.eudr.deforestation?.riskLevel ?? "").toLowerCase() === "high";
  const status = p.eudr.protectedArea?.status;
  return loss || status === "non_compliant" || status === "indicative" ? "review" : "clear";
}

const WS_COLS = 16;
const WS_JSONB = new Set([7, 8, 9, 14, 15]); // checks, issues, geometry, wdpa_categories, eudr

/** Replace the user's workspace in one transaction. */
export async function writeWorkspaceToDb(
  user: { uid: string; email: string },
  ws: { plots: Plot[]; eudrDone: boolean; updatedAt: number },
): Promise<void> {
  await ensureWorkspaceSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO workspaces (user_uid, user_email, eudr_done, updated_at)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
       ON CONFLICT (user_uid) DO UPDATE
         SET user_email = EXCLUDED.user_email, eudr_done = EXCLUDED.eudr_done, updated_at = EXCLUDED.updated_at`,
      [user.uid, user.email, ws.eudrDone, ws.updatedAt],
    );
    await client.query("DELETE FROM workspace_plots WHERE user_uid = $1", [user.uid]);
    for (let start = 0; start < ws.plots.length; start += 200) {
      const chunk = ws.plots.slice(start, start + 200);
      const params: unknown[] = [];
      const tuples = chunk.map((p, i) => {
        const d = p.eudr?.deforestation;
        const pa = p.eudr?.protectedArea;
        params.push(
          user.uid,
          p.id,
          start + i,
          p.plotId,
          p.name,
          p.areaHa,
          p.isValid,
          JSON.stringify(p.checks),
          JSON.stringify(p.issues ?? []),
          JSON.stringify({ type: "Polygon", coordinates: [closedRing(p.ring)] }),
          statusOf(p),
          d ? d.riskLevel.toLowerCase() : null,
          d ? Math.max(d.gfw.ha, d.jrc.ha, d.sbtn.ha) : null,
          pa ? pa.status : null,
          pa ? JSON.stringify(pa.categories) : null,
          p.eudr ? JSON.stringify(p.eudr) : null,
        );
        const o = i * WS_COLS;
        return `(${Array.from({ length: WS_COLS }, (_, k) => `$${o + k + 1}${WS_JSONB.has(k) ? "::jsonb" : ""}`).join(",")})`;
      });
      await client.query(
        `INSERT INTO workspace_plots
           (user_uid, local_id, position, plot_id, name, area_ha, is_valid, checks, issues, geometry,
            status, deforestation_risk, loss_ha, wdpa_status, wdpa_categories, eudr)
         VALUES ${tuples.join(",")}`,
        params,
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function readWorkspaceFromDb(
  uid: string,
): Promise<{ plots: Plot[]; eudrDone: boolean; updatedAt: number } | null> {
  await ensureWorkspaceSchema();
  const head = await getPool().query(
    "SELECT eudr_done, (extract(epoch FROM updated_at) * 1000)::float8 AS updated_ms FROM workspaces WHERE user_uid = $1",
    [uid],
  );
  if (!head.rowCount) return null;
  const rows = await getPool().query(
    `SELECT local_id, plot_id, name, area_ha, is_valid, checks, issues, geometry, eudr
       FROM workspace_plots WHERE user_uid = $1 ORDER BY position`,
    [uid],
  );
  const plots: Plot[] = rows.rows.map((r) => {
    const plot: Plot = {
      id: r.local_id,
      plotId: r.plot_id ?? "",
      name: r.name,
      ring: (r.geometry.coordinates[0] as [number, number][]).slice(0, -1), // drop the closing point
      areaHa: r.area_ha,
      checks: r.checks,
      isValid: r.is_valid,
      issues: r.issues ?? [],
    };
    if (r.eudr) plot.eudr = r.eudr;
    return plot;
  });
  return { plots, eudrDone: head.rows[0].eudr_done, updatedAt: Math.round(head.rows[0].updated_ms) };
}

/* -------------------------------------------------------------------------- */
/*  DDS Submission: each user's EUIS identity and statements                  */
/* -------------------------------------------------------------------------- */

let ddsSchemaReady: Promise<void> | null = null;

/**
 * `dds_accounts`: one row per user, with the EUIS Acceptance identity (the
 * authentication key inside it is AES-256-GCM sealed, never plain text).
 * `dds_statements`: one row per statement, summary columns plus the full record in `doc`.
 */
function ensureDdsSchema(): Promise<void> {
  if (!ddsSchemaReady) {
    ddsSchemaReady = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS dds_accounts (
          user_uid          TEXT PRIMARY KEY,
          user_email        TEXT,
          identity          JSONB,
          state_updated_ms  BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dds_statements (
          id                   TEXT PRIMARY KEY,
          user_uid             TEXT NOT NULL REFERENCES dds_accounts (user_uid) ON DELETE CASCADE,
          status               TEXT NOT NULL,
          environment          TEXT NOT NULL,
          internal_reference   TEXT,
          euis_uuid            TEXT,
          reference_number     TEXT,
          verification_number  TEXT,
          area_ha              DOUBLE PRECISION NOT NULL,
          plot_count           INTEGER NOT NULL,
          doc                  JSONB NOT NULL,
          created_at           TIMESTAMPTZ NOT NULL,
          updated_at           TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS dds_statements_user_idx ON dds_statements (user_uid);
        CREATE INDEX IF NOT EXISTS dds_statements_status_idx ON dds_statements (status);
      `)
      .then(() => undefined)
      .catch((e) => {
        ddsSchemaReady = null;
        throw e;
      });
  }
  return ddsSchemaReady;
}

export type DdsRowSource = {
  id: string;
  status: string;
  environment: string;
  internalReference?: string;
  euis: { uuid?: string; referenceNumber?: string; verificationNumber?: string };
  areaHa: number;
  plots: unknown[];
  createdAt: number;
  updatedAt: number;
};

type DdsDbState<S> = { identity: unknown | null; statements: Record<string, S>; updatedAt: number };

/** Mirror the user's DDS state in one transaction. */
export async function writeDdsStateToDb<S extends DdsRowSource>(user: { uid: string; email: string }, state: DdsDbState<S>): Promise<void> {
  await ensureDdsSchema();
  const client = await getPool().connect();
  const list = Object.values(state.statements);
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO dds_accounts (user_uid, user_email, identity, state_updated_ms)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (user_uid) DO UPDATE
         SET user_email = EXCLUDED.user_email, identity = EXCLUDED.identity, state_updated_ms = EXCLUDED.state_updated_ms`,
      [user.uid, user.email, state.identity ? JSON.stringify(state.identity) : null, state.updatedAt],
    );
    await client.query("DELETE FROM dds_statements WHERE user_uid = $1 AND NOT (id = ANY($2::text[]))", [user.uid, list.map((s) => s.id)]);
    for (const s of list) {
      await client.query(
        `INSERT INTO dds_statements
           (id, user_uid, status, environment, internal_reference, euis_uuid, reference_number, verification_number,
            area_ha, plot_count, doc, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, to_timestamp($12 / 1000.0), to_timestamp($13 / 1000.0))
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status, environment = EXCLUDED.environment, internal_reference = EXCLUDED.internal_reference,
           euis_uuid = EXCLUDED.euis_uuid, reference_number = EXCLUDED.reference_number,
           verification_number = EXCLUDED.verification_number, area_ha = EXCLUDED.area_ha,
           plot_count = EXCLUDED.plot_count, doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at
         WHERE dds_statements.user_uid = EXCLUDED.user_uid`,
        [
          s.id,
          user.uid,
          s.status,
          s.environment,
          s.internalReference ?? null,
          s.euis.uuid ?? null,
          s.euis.referenceNumber ?? null,
          s.euis.verificationNumber ?? null,
          s.areaHa,
          s.plots.length,
          JSON.stringify(s),
          s.createdAt,
          s.updatedAt,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function readDdsStateFromDb(uid: string): Promise<{ identity: unknown | null; statements: unknown[]; updatedAt: number } | null> {
  await ensureDdsSchema();
  const head = await getPool().query("SELECT identity, state_updated_ms FROM dds_accounts WHERE user_uid = $1", [uid]);
  if (!head.rowCount) return null;
  const rows = await getPool().query("SELECT doc FROM dds_statements WHERE user_uid = $1 ORDER BY created_at", [uid]);
  return { identity: head.rows[0].identity ?? null, statements: rows.rows.map((r) => r.doc), updatedAt: Number(head.rows[0].state_updated_ms) };
}
