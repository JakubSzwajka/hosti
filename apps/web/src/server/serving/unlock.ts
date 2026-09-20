/**
 * The cookie a guest gets for typing the right PIN, and the budget of wrong
 * guesses before the gate shuts.
 *
 * The cookie unlocks one share link and nothing else. Its name carries the
 * share slug and its Path is the share prefix, so the browser sends it to that
 * one link. A bundle has one link, so the cookie and the link go together.
 *
 * The signature also covers the bundle row the link resolved to and the pin
 * hash guarding it. Three things therefore kill every outstanding grant at
 * once: a rotate, because the path and the slug both change; a new or removed
 * pin, because the hash changes; and deleting the bundle, because a rebuilt
 * bundle on the same slug is a different row with a different pin hash. None of
 * that costs a stored session, and Hosti still records nothing about the guest.
 */
import { createHmac, randomBytes } from "node:crypto";
import { constantTimeEquals } from "@/server/auth/session";

/** Long enough to read a report in one sitting, short enough to expire by morning. */
export const UNLOCK_MAX_AGE_SECONDS = 12 * 60 * 60;

export const UNLOCK_COOKIE_PREFIX = "hosti_pin_";

/**
 * What a grant is tied to: this exact bundle row, guarded by this exact pin
 * hash. Neither value travels in the cookie; both go into the signature, so a
 * grant cannot be read back for either of them.
 */
export type UnlockBinding = { bundleId: number; pinHash: string };

type Unlocked = { slug: string; iat: number; exp: number };

export function unlockCookieName(shareSlug: string): string {
  return `${UNLOCK_COOKIE_PREFIX}${shareSlug}`;
}

function sign(secret: string, payload: string, binding: UnlockBinding): string {
  return createHmac("sha256", secret)
    .update(payload)
    .update("\u0000")
    .update(String(binding.bundleId))
    .update("\u0000")
    .update(binding.pinHash)
    .digest("base64url");
}

/** A signed grant naming the one share link it opens, on the one bundle it opens. */
export function signUnlock(
  secret: string,
  shareSlug: string,
  binding: UnlockBinding,
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
  return `${payload}.${sign(secret, payload, binding)}`;
}

/** Is this cookie a live grant for this exact share link on this exact bundle? */
export function verifyUnlock(
  secret: string,
  shareSlug: string,
  binding: UnlockBinding,
  value: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  if (!constantTimeEquals(sign(secret, payload, binding), signature)) return false;

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
