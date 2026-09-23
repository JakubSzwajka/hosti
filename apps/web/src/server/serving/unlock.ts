import { createHmac, randomBytes } from "node:crypto";
import { constantTimeEquals } from "@/server/auth/session";

export const UNLOCK_MAX_AGE_SECONDS = 12 * 60 * 60;

export const UNLOCK_COOKIE_PREFIX = "hosti_pin_";

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
