/**
 * The cookie a guest gets for typing the right PIN, and the budget of wrong
 * guesses before the gate shuts.
 *
 * The cookie unlocks one share link and nothing else. Its name carries the
 * share slug and its Path is the share prefix, so a second link on the same
 * bundle asks again even though both point at the same files. That is the whole
 * point: protection sits on the link, not on the bundle.
 */
import { createHmac, randomBytes } from "node:crypto";
import { constantTimeEquals } from "@/server/auth/session";

/** Long enough to read a report in one sitting, short enough to expire by morning. */
export const UNLOCK_MAX_AGE_SECONDS = 12 * 60 * 60;

export const UNLOCK_COOKIE_PREFIX = "hosti_pin_";

type Unlocked = { slug: string; iat: number; exp: number };

export function unlockCookieName(shareSlug: string): string {
  return `${UNLOCK_COOKIE_PREFIX}${shareSlug}`;
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** A signed grant naming the one share link it opens. */
export function signUnlock(
  secret: string,
  shareSlug: string,
  options: { now?: number; maxAgeSeconds?: number } = {},
): string {
  const now = options.now ?? Date.now();
  const maxAge = options.maxAgeSeconds ?? UNLOCK_MAX_AGE_SECONDS;
  const claims: Unlocked & { nonce: string } = {
    slug: shareSlug,
    iat: now,
    exp: now + maxAge * 1000,
    nonce: randomBytes(8).toString("hex"),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

/** Is this cookie a live grant for this exact share link? */
export function verifyUnlock(
  secret: string,
  shareSlug: string,
  value: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  if (!constantTimeEquals(sign(secret, payload), signature)) return false;

  let claims: Unlocked;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Unlocked;
  } catch {
    return false;
  }
  if (claims.slug !== shareSlug) return false;
  return typeof claims.exp === "number" && claims.exp > now;
}

/** `Path` is the share prefix, so the browser sends this to one link only. */
export function unlockCookie(
  shareSlug: string,
  value: string,
  options: { secure: boolean },
): string {
  const parts = [
    `${unlockCookieName(shareSlug)}=${value}`,
    `Path=/v/${shareSlug}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${UNLOCK_MAX_AGE_SECONDS}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
