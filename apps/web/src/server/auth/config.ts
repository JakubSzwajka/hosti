import { OWNER_PASSWORD_HASH_VAR, SECRET_VAR, type AdminSecrets } from "@hosti/identity";
import { runIdentitySync } from "@/server/runtime";

export type { AdminSecrets };
export { OWNER_PASSWORD_HASH_VAR, SECRET_VAR };

export function missingAdminVars(): string[] {
  return runIdentitySync((identity) => identity.missingAdminVars);
}

export function signingSecret(): string | null {
  return runIdentitySync((identity) => identity.signingSecret);
}

export function adminSecrets(): AdminSecrets | null {
  return runIdentitySync((identity) => identity.adminSecrets);
}
