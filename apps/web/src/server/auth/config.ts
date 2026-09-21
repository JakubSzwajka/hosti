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

/**
 * The signing key on its own. The PIN gate needs it to sign unlock cookies and
 * does not care about the owner password, because no owner is involved: the
 * guest at the gate has a link and four digits, nothing else.
 */
export function signingSecret(): string | null {
  return process.env[SECRET_VAR]?.trim() || null;
}

/**
 * The secrets, or null when either one is missing. Both are trimmed so that
 * every reader agrees on the value: a deployment panel that stores a trailing
 * space or a `\r` would otherwise pass the configured check here, fail every
 * password comparison, and sign admin cookies with a key the PIN gate cannot
 * reproduce through `signingSecret()`.
 */
export function adminSecrets(): AdminSecrets | null {
  const password = process.env[OWNER_PASSWORD_VAR]?.trim();
  const secret = process.env[SECRET_VAR]?.trim();
  if (!password || !secret) return null;
  return { password, secret };
}
