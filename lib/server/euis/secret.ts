import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * EUIS authentication keys are stored encrypted (AES-256-GCM). The key comes from
 * EUIS_CREDENTIAL_ENC_KEY: 32 bytes as base64 or hex (`openssl rand -base64 32`).
 * Outside production a development key derived from SESSION_SECRET is used instead,
 * so local runs and e2e tests work without setup. Production without the variable
 * refuses to store or read keys.
 */

export class SecretConfigError extends Error {}

function key(): Buffer {
  const raw = process.env.EUIS_CREDENTIAL_ENC_KEY?.trim();
  if (raw) {
    const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new SecretConfigError("EUIS_CREDENTIAL_ENC_KEY must be 32 bytes (base64 or hex).");
    return buf;
  }
  if (process.env.NODE_ENV === "production") throw new SecretConfigError("EUIS_CREDENTIAL_ENC_KEY is not set.");
  return createHash("sha256").update(`locanix-dev-euis:${process.env.SESSION_SECRET || "dev"}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}

export function openSecret(sealed: string): string {
  if (!sealed.startsWith("v1:")) throw new SecretConfigError("Unknown secret format.");
  const raw = Buffer.from(sealed.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  try {
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretConfigError("The stored EUIS key can't be decrypted (was EUIS_CREDENTIAL_ENC_KEY changed?). Enter it again in Settings.");
  }
}
