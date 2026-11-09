import { promises as fs } from "fs";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import { dataDir } from "./dataDir";
import type { DataConsent } from "../consent";

export type User = {
  id: string;
  name: string;
  email: string; // stored lowercased
  passwordHash: string;
  verified: boolean;
  verifyToken: string | null;
  createdAt: number;
  freeUsedHa: number; // cumulative hectares analyzed on the free tier
  paid: boolean; // unlocks dashboard + Excel export
  // Password reset: only a SHA-256 of the emailed token is stored.
  resetTokenHash?: string | null;
  resetExpires?: number | null;
  resetRequestedAt?: number | null;
  // Agreement to store and reuse uploaded plot data (see lib/consent.ts).
  dataConsent?: DataConsent | null;
};

const DATA_DIR = dataDir();
const FILE = path.join(DATA_DIR, "users.json");

async function readAll(): Promise<User[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as User[];
  } catch {
    return [];
  }
}

async function writeAll(users: User[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(users, null, 2), "utf8");
}

export function newToken(): string {
  return randomBytes(24).toString("hex");
}

export async function findByEmail(email: string): Promise<User | null> {
  const all = await readAll();
  return all.find((u) => u.email === email.toLowerCase()) ?? null;
}

export async function findById(id: string): Promise<User | null> {
  const all = await readAll();
  return all.find((u) => u.id === id) ?? null;
}

export async function findByToken(token: string): Promise<User | null> {
  const all = await readAll();
  return all.find((u) => u.verifyToken === token) ?? null;
}

export async function findByResetTokenHash(hash: string): Promise<User | null> {
  const all = await readAll();
  return all.find((u) => u.resetTokenHash === hash && (u.resetExpires ?? 0) > Date.now()) ?? null;
}

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
  verifyToken: string;
}): Promise<User> {
  const all = await readAll();
  const user: User = {
    id: randomUUID(),
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash: input.passwordHash,
    verified: false,
    verifyToken: input.verifyToken,
    createdAt: Date.now(),
    freeUsedHa: 0,
    paid: false,
  };
  all.push(user);
  await writeAll(all);
  return user;
}

export async function updateUser(
  id: string,
  patch: Partial<Omit<User, "id">>,
): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex((u) => u.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...patch };
  await writeAll(all);
}

/** Atomically add to freeUsedHa (reads current value within the same operation). */
export async function addFreeUsedHa(id: string, area: number): Promise<User | null> {
  const all = await readAll();
  const idx = all.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  all[idx].freeUsedHa = (all[idx].freeUsedHa ?? 0) + Math.max(0, area);
  await writeAll(all);
  return all[idx];
}
