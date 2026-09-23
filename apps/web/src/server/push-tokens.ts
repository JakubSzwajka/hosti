import {
  CATALOG_UPLOAD,
  TOKEN_NAME_MAX_LENGTH,
  TOKEN_NAME_RULE,
  type PushIdentity,
  type PushTokenRecord,
} from "@hosti/identity";
import { runIdentitySync } from "@/server/runtime";

export type { PushIdentity, PushTokenRecord };
export { CATALOG_UPLOAD, TOKEN_NAME_MAX_LENGTH, TOKEN_NAME_RULE };

export function hashToken(secret: string): string {
  return runIdentitySync((identity) => identity.hashToken(secret));
}

export function readTokenName(value: unknown): string {
  return runIdentitySync((identity) => identity.readTokenName(value));
}

export function createPushToken(name: string): { id: number; name: string; secret: string } {
  return runIdentitySync((identity) => identity.createPushToken(name));
}

export function listPushTokens(): PushTokenRecord[] {
  return runIdentitySync((identity) => identity.listPushTokens);
}

export function deletePushToken(id: number): boolean {
  return runIdentitySync((identity) => identity.deletePushToken(id));
}

export function authenticatePush(request: Request): PushIdentity | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const secret = header.slice("Bearer ".length).trim();
  if (!secret) return null;
  return runIdentitySync((identity) => identity.authenticatePush(secret));
}
