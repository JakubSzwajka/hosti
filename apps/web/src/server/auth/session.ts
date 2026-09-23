import type { AdminSession } from "@hosti/identity";
import { SESSION_MAX_AGE_SECONDS } from "@hosti/identity";
import { runIdentitySync } from "@/server/runtime";

export const SESSION_COOKIE = "hosti_admin";
export { SESSION_MAX_AGE_SECONDS };
export type { AdminSession };

export function constantTimeEquals(a: string, b: string): boolean {
  return runIdentitySync((identity) => identity.constantTimeEquals(a, b));
}

export function signSession(
  secret: string,
  options: { now?: number; maxAgeSeconds?: number } = {},
): string {
  return runIdentitySync((identity) => identity.signSession(secret, options));
}

export function verifySession(
  secret: string,
  value: string | undefined | null,
  now?: number,
): AdminSession | null {
  return runIdentitySync((identity) => identity.verifySession(secret, value, now));
}

export function mutationToken(secret: string, session: AdminSession): string {
  return runIdentitySync((identity) => identity.mutationToken(secret, session));
}

export function checkMutationToken(
  secret: string,
  session: AdminSession,
  supplied: string | null | undefined,
): boolean {
  return runIdentitySync((identity) => identity.checkMutationToken(secret, session, supplied));
}
