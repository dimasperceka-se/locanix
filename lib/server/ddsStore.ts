import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DdsDetails, DdsHistoryEntry, DdsStatus, EuisInfo } from "../ddsShared";
import { dataDir } from "./dataDir";
import { hasDatabase, readDdsStateFromDb, writeDdsStateToDb } from "./db";

/**
 * Per-user DDS state: the EUIS identity and the statements. The file under
 * .data/dds is the working copy (a per-user lock makes each change atomic, which
 * the submit-once guarantee relies on); every change is mirrored to PostgreSQL
 * (`dds_accounts`, `dds_statements`) when DATABASE_URL is set. Reads take whichever
 * copy is newer, so a server with a fresh disk picks up the database copy.
 */

export type EuisIdentity = {
  name: string;
  username: string;
  clientId: string;
  operatorAccessId: string;
  /** AES-256-GCM sealed authentication key (see euis/secret.ts). */
  authKeySealed: string;
  updatedAt: number;
  lastTest?: { ok: boolean; at: number; message: string };
};

export type StoredPlot = { workspaceId: number; plotId: string; name: string; ring: [number, number][]; areaHa: number; key: string };

export type DdsStatement = {
  id: string;
  status: DdsStatus;
  environment: "acceptance" | "mock";
  createdAt: number;
  updatedAt: number;
  details: DdsDetails;
  plots: StoredPlot[];
  areaHa: number;
  attempt: number;
  internalReference?: string;
  submitStartedAt?: number;
  submittedAt?: number;
  lastCheckedAt?: number;
  nextCheckAt?: number;
  lastError?: string;
  euis: EuisInfo;
  confirmedBy?: { name: string; email: string; at: number };
  history: DdsHistoryEntry[];
};

export type DdsState = { identity: EuisIdentity | null; statements: Record<string, DdsStatement>; updatedAt: number };

export class DdsError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const errorText = (e: unknown) => (e as { code?: string })?.code || (e as Error)?.message || String(e);
const safeUid = (uid: string) => uid.replace(/[^A-Za-z0-9-]/g, "");
const empty = (): DdsState => ({ identity: null, statements: {}, updatedAt: 0 });

async function readFileState(uid: string): Promise<DdsState | null> {
  try {
    return JSON.parse(await readFile(path.join(dataDir("dds"), `${safeUid(uid)}.json`), "utf8")) as DdsState;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e; // fail closed: never replace an unreadable state with an empty one
  }
}

async function readDbState(uid: string): Promise<DdsState | null> {
  if (!hasDatabase()) return null;
  try {
    const row = await readDdsStateFromDb(uid);
    if (!row) return null;
    const statements: Record<string, DdsStatement> = {};
    for (const s of row.statements as DdsStatement[]) statements[s.id] = s;
    return { identity: (row.identity as EuisIdentity | null) ?? null, statements, updatedAt: row.updatedAt };
  } catch (e) {
    console.error("[dds] database read failed:", errorText(e));
    return null;
  }
}

async function newest(uid: string): Promise<DdsState> {
  const [file, db] = await Promise.all([readFileState(uid), readDbState(uid)]);
  if (file && db) return db.updatedAt > file.updatedAt ? db : file;
  return file ?? db ?? empty();
}

/** Read-only snapshot. */
export const readDdsState = (uid: string) => newest(uid);

const LOCK_STALE_MS = 2 * 60 * 1000;

/** Run `fn` on the user's state under a per-user lock; the result is saved when it returns. */
export async function ddsTransaction<T>(user: { uid: string; email: string }, fn: (state: DdsState) => Promise<T> | T): Promise<T> {
  const dir = dataDir("dds");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const id = safeUid(user.uid);
  const lock = path.join(dir, `${id}.lock`);
  const deadline = Date.now() + 20_000;
  while (true) {
    try {
      await mkdir(lock);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      // A crashed request must not lock the user out forever. No transaction holds
      // the lock across a network call, so two minutes is far beyond any real use.
      const age = await stat(lock).then((s) => Date.now() - s.mtimeMs).catch(() => 0);
      if (age > LOCK_STALE_MS) await rm(lock, { recursive: true, force: true });
      else if (Date.now() > deadline) throw new DdsError("Your statements are busy. Please retry.", 503);
      else await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  const file = path.join(dir, `${id}.json`);
  const temp = path.join(dir, `${randomUUID()}.tmp`);
  try {
    const state = await newest(user.uid);
    const result = await fn(state);
    state.updatedAt = Math.max(Date.now(), state.updatedAt + 1);
    await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
    await rename(temp, file);
    if (hasDatabase()) {
      await writeDdsStateToDb(user, state).catch((e) => console.error("[dds] database write failed:", errorText(e)));
    }
    return result;
  } finally {
    await rm(temp, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
