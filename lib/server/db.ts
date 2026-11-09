import { Pool } from "pg";

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
