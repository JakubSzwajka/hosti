/**
 * The two secrets the catalog needs. Without them Hosti must refuse to serve
 * admin pages rather than let anyone in, so this module reports what is missing
 * instead of inventing a default.
 */

export type AdminSecrets = {
  /** The owner password, compared in constant time on the login form. */
  password: string;
  /** The key the admin session cookie is signed with. */
  secret: string;
};

export const OWNER_PASSWORD_VAR = "HOSTI_OWNER_PASSWORD";
export const SECRET_VAR = "HOSTI_SECRET";

/** Names of the variables that are unset or empty, in the order to fix them. */
export function missingAdminVars(): string[] {
  const missing: string[] = [];
  if (!process.env[OWNER_PASSWORD_VAR]?.trim()) missing.push(OWNER_PASSWORD_VAR);
  if (!process.env[SECRET_VAR]?.trim()) missing.push(SECRET_VAR);
  return missing;
}

/** The secrets, or null when either one is missing. */
export function adminSecrets(): AdminSecrets | null {
  const password = process.env[OWNER_PASSWORD_VAR];
  const secret = process.env[SECRET_VAR];
  if (!password?.trim() || !secret?.trim()) return null;
  return { password, secret };
}
