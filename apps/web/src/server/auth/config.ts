export type AdminSecrets = {
  password: string;

  secret: string;
};

export const OWNER_PASSWORD_VAR = "HOSTI_OWNER_PASSWORD";
export const SECRET_VAR = "HOSTI_SECRET";

export function missingAdminVars(): string[] {
  const missing: string[] = [];
  if (!process.env[OWNER_PASSWORD_VAR]?.trim()) missing.push(OWNER_PASSWORD_VAR);
  if (!process.env[SECRET_VAR]?.trim()) missing.push(SECRET_VAR);
  return missing;
}

export function signingSecret(): string | null {
  return process.env[SECRET_VAR]?.trim() || null;
}

export function adminSecrets(): AdminSecrets | null {
  const password = process.env[OWNER_PASSWORD_VAR]?.trim();
  const secret = process.env[SECRET_VAR]?.trim();
  if (!password || !secret) return null;
  return { password, secret };
}
