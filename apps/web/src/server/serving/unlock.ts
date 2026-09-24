import { UNLOCK_COOKIE_PREFIX, UNLOCK_MAX_AGE_SECONDS, type UnlockBinding } from "@hosti/serving";
import { runServingSync } from "@/server/runtime";

export { UNLOCK_COOKIE_PREFIX, UNLOCK_MAX_AGE_SECONDS };
export type { UnlockBinding };

export function unlockCookieName(shareSlug: string): string {
  return runServingSync((serving) => serving.unlockCookieName(shareSlug));
}

export function signUnlock(
  secret: string,
  shareSlug: string,
  binding: UnlockBinding,
  options: { now?: number; maxAgeSeconds?: number } = {},
): string {
  return runServingSync((serving) => serving.signUnlock(secret, shareSlug, binding, options));
}

export function verifyUnlock(
  secret: string,
  shareSlug: string,
  binding: UnlockBinding,
  value: string | null | undefined,
  now?: number,
): boolean {
  return runServingSync((serving) => serving.verifyUnlock(secret, shareSlug, binding, value, now));
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
