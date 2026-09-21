import { randomBytes } from "node:crypto";

/**
 * Where a freshly minted push token secret waits to be shown once.
 *
 * A secret is stored nowhere: the database keeps only its digest, so the one
 * moment the owner can copy it is the page that follows the mint. That page is
 * reached by a redirect, and the secret cannot ride along in the URL, because
 * a URL lands in history, in a proxy log and in a referrer. So the redirect
 * carries a random id and the value stays in this process.
 *
 * It is per-process on purpose. A restart, a second server or Next reloading
 * the module loses it, and the owner sees the page with nothing to copy. That
 * is the correct failure: the alternative is writing the secret somewhere it
 * outlives the one read, which is what the digest exists to avoid.
 *
 * The first read takes the entry away, so a reload, a back button or anyone
 * replaying the URL gets nothing.
 */

/** How long an unread secret survives. Long enough to copy, short enough to forget. */
const TTL_MS = 5 * 60 * 1000;

type Held = { secret: string; expiresAt: number };

// Next reloads modules in development, so the map hangs off globalThis to give
// one mint and the read that follows it the same store.
const globalCache = globalThis as typeof globalThis & {
  __hostiMintedSecrets?: Map<string, Held>;
};

function store(): Map<string, Held> {
  globalCache.__hostiMintedSecrets ??= new Map();
  return globalCache.__hostiMintedSecrets;
}

/** Drop whatever nobody came back for. Called on the way in and out, so no timer runs. */
function sweep(now: number): void {
  for (const [id, held] of store()) {
    if (held.expiresAt <= now) store().delete(id);
  }
}

/** Hold a minted secret and return the id the redirect carries. */
export function holdMintedSecret(secret: string, now = Date.now()): string {
  sweep(now);
  const id = randomBytes(16).toString("base64url");
  store().set(id, { secret, expiresAt: now + TTL_MS });
  return id;
}

/**
 * Read a held secret and forget it. Returns null for an id that was never
 * held, has already been read, or waited too long. The caller cannot tell
 * those apart, and nothing about them is worth telling apart.
 */
export function takeMintedSecret(id: string | null | undefined, now = Date.now()): string | null {
  sweep(now);
  if (!id) return null;
  const held = store().get(id);
  if (!held) return null;
  store().delete(id);
  return held.secret;
}
