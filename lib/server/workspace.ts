import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Plot } from "../geo";
import { dataDir } from "./dataDir";
import { hasDatabase, readWorkspaceFromDb, writeWorkspaceToDb } from "./db";

/**
 * A user's plot workspace: their plots with geometry checks and EUDR results.
 * Stored in PostgreSQL (tables `workspaces` + `workspace_plots`) when DATABASE_URL
 * is set, and always mirrored to a file under .data/workspaces, so it survives a
 * database outage. Reads take whichever copy is newer.
 */
export type Workspace = { plots: Plot[]; eudrDone: boolean; updatedAt: number };

export class WorkspaceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const MAX_PLOTS = 5000;
/** pg connection errors (e.g. ECONNREFUSED) often have an empty message. */
const errorText = (e: unknown) => (e as { code?: string })?.code || (e as Error)?.message || String(e);
const MAX_VERTICES = 20000;
const MAX_RESULT_BYTES = 20000;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function sanitizePlot(raw: unknown): Plot {
  const p = (raw ?? {}) as Record<string, unknown>;
  const id = num(p.id);
  if (id === null || !Number.isInteger(id)) throw new WorkspaceError("Each plot needs a numeric id.");
  if (!Array.isArray(p.ring) || p.ring.length > MAX_VERTICES) throw new WorkspaceError("Invalid plot boundary.");
  const ring = p.ring.map((c) => {
    const lon = num(Array.isArray(c) ? c[0] : null);
    const lat = num(Array.isArray(c) ? c[1] : null);
    if (lon === null || lat === null || Math.abs(lon) > 180 || Math.abs(lat) > 90) throw new WorkspaceError("Invalid coordinates.");
    return [lon, lat] as [number, number];
  });
  const checks = (p.checks ?? {}) as Record<string, unknown>;
  const plot: Plot = {
    id,
    plotId: str(p.plotId, 200),
    name: str(p.name, 300),
    ring,
    areaHa: num(p.areaHa) ?? 0,
    checks: {
      duplicateVertices: checks.duplicateVertices === true,
      zeroArea: checks.zeroArea === true,
      selfIntersection: checks.selfIntersection === true,
    },
    isValid: p.isValid === true,
    issues: Array.isArray(p.issues) ? p.issues.slice(0, 20).map((s) => str(s, 300)) : [],
  };
  // Analysis results come from the analysis API via the browser; keep them as-is but bounded.
  if (p.eudr && typeof p.eudr === "object") {
    const json = JSON.stringify(p.eudr);
    if (json.length > MAX_RESULT_BYTES) throw new WorkspaceError("Analysis result too large.");
    plot.eudr = JSON.parse(json);
  }
  return plot;
}

export function sanitizeWorkspace(input: unknown): Omit<Workspace, "updatedAt"> {
  const w = (input ?? {}) as Record<string, unknown>;
  if (!Array.isArray(w.plots)) throw new WorkspaceError("plots must be an array.");
  if (w.plots.length > MAX_PLOTS) throw new WorkspaceError(`At most ${MAX_PLOTS} plots.`, 413);
  const plots = w.plots.map(sanitizePlot);
  if (new Set(plots.map((p) => p.id)).size !== plots.length) throw new WorkspaceError("Plot ids must be unique.");
  return { plots, eudrDone: w.eudrDone === true };
}

const fileFor = (uid: string) => path.join(dataDir("workspaces"), `${uid.replace(/[^A-Za-z0-9-]/g, "")}.json`);

async function readFileStore(uid: string): Promise<Workspace | null> {
  try {
    return JSON.parse(await readFile(fileFor(uid), "utf8")) as Workspace;
  } catch {
    return null;
  }
}

async function writeFileStore(uid: string, ws: Workspace) {
  const dir = dataDir("workspaces");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temp = path.join(dir, `${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(ws), { mode: 0o600 });
  await rename(temp, fileFor(uid)); // atomic replace
}

export async function loadWorkspace(uid: string): Promise<Workspace | null> {
  const [fromFile, fromDb] = await Promise.all([
    readFileStore(uid),
    hasDatabase()
      ? readWorkspaceFromDb(uid).catch((e) => {
          console.error("[workspace] database read failed:", errorText(e));
          return null;
        })
      : Promise.resolve(null),
  ]);
  if (fromFile && fromDb) return fromDb.updatedAt >= fromFile.updatedAt ? fromDb : fromFile;
  return fromDb ?? fromFile;
}

/** Save to the file store and, when configured, the database. Returns where it landed. */
export async function saveWorkspace(user: { uid: string; email: string }, data: Omit<Workspace, "updatedAt">) {
  const ws: Workspace = { ...data, updatedAt: Date.now() };
  await writeFileStore(user.uid, ws);
  let database = false;
  if (hasDatabase()) {
    try {
      await writeWorkspaceToDb(user, ws);
      database = true;
    } catch (e) {
      console.error("[workspace] database write failed:", errorText(e));
    }
  }
  return { updatedAt: ws.updatedAt, database };
}
