import { randomBytes } from "node:crypto";

const TTL_MS = 5 * 60 * 1000;

type Held = { secret: string; expiresAt: number };

const globalCache = globalThis as typeof globalThis & {
  __hostiMintedSecrets?: Map<string, Held>;
};

function store(): Map<string, Held> {
  globalCache.__hostiMintedSecrets ??= new Map();
  return globalCache.__hostiMintedSecrets;
}

function sweep(now: number): void {
  for (const [id, held] of store()) {
    if (held.expiresAt <= now) store().delete(id);
  }
}

export function holdMintedSecret(secret: string, now = Date.now()): string {
  sweep(now);
  const id = randomBytes(16).toString("base64url");
  // Only the opaque id leaves this process; the secret stays out of URLs and logs.
  store().set(id, { secret, expiresAt: now + TTL_MS });
  return id;
}

export function takeMintedSecret(id: string | null | undefined, now = Date.now()): string | null {
  sweep(now);
  if (!id) return null;
  const held = store().get(id);
  if (!held) return null;
  store().delete(id);
  return held.secret;
}
