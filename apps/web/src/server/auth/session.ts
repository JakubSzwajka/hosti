import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The admin session: a signed cookie, nothing else. There are no users, so the
 * cookie carries only when it was minted, when it dies and a nonce. The nonce
 * is what the per-session mutation token is derived from, so a stolen mutation
 * token is useless once the owner logs in again.
 */

export const SESSION_COOKIE = "hosti_admin";
/** Thirty days. Long enough that the owner types the password rarely. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type AdminSession = {
  /** Issued at, epoch milliseconds. */
  iat: number;
  /** Expires at, epoch milliseconds. */
  exp: number;
  /** Random per-session value. The mutation token hangs off this. */
  nonce: string;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(secret: string, message: string): Buffer {
  return createHmac("sha256", secret).update(message).digest();
}

/**
 * Compare two strings without leaking where they first differ, or how long
 * either one is. `timingSafeEqual` throws on a length mismatch, so both sides
 * are hashed first: the digests are always 32 bytes.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const leftDigest = createHmac("sha256", "hosti-compare").update(a, "utf8").digest();
  const rightDigest = createHmac("sha256", "hosti-compare").update(b, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

/** Mint a cookie value: `<payload>.<signature>`, both base64url. */
export function signSession(
  secret: string,
  options: { now?: number; maxAgeSeconds?: number } = {},
): string {
  const now = options.now ?? Date.now();
  const maxAge = options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
  const session: AdminSession = {
    iat: now,
    exp: now + maxAge * 1000,
    nonce: randomBytes(16).toString("hex"),
  };
  const payload = base64url(JSON.stringify(session));
  return `${payload}.${base64url(hmac(secret, payload))}`;
}

/**
 * Read a cookie value back. Returns null for anything that is not a live
 * session: a wrong shape, a tampered payload, a foreign signature, an expired
 * stamp. The caller never learns which.
 */
export function verifySession(
  secret: string,
  value: string | undefined | null,
  now = Date.now(),
): AdminSession | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];
  const expected = base64url(hmac(secret, payload));
  if (!constantTimeEquals(expected, signature)) return null;

  let session: AdminSession;
  try {
    session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
  } catch {
    return null;
  }
  if (typeof session?.exp !== "number" || typeof session?.nonce !== "string") return null;
  if (session.exp <= now) return null;
  return session;
}

/**
 * The value every mutation form carries. A script running inside a bundle
 * cannot read it out of the HttpOnly cookie, so a blind cross-page POST fails.
 */
export function mutationToken(secret: string, session: AdminSession): string {
  return base64url(hmac(secret, `hosti-mutation:${session.nonce}`));
}

export function checkMutationToken(
  secret: string,
  session: AdminSession,
  supplied: string | null | undefined,
): boolean {
  if (!supplied) return false;
  return constantTimeEquals(mutationToken(secret, session), supplied);
}
