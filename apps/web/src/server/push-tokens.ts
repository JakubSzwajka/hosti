import { createHash, randomBytes } from "node:crypto";
import { db, nowIso } from "@/server/db";

const PREFIX = "hosti_";

/** Tokens are high-entropy random strings, so a plain digest is the right store. */
export function hashToken(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Mint a push token. The secret is returned once and never stored in clear. */
export function createPushToken(name: string): { name: string; secret: string } {
  const secret = PREFIX + randomBytes(24).toString("base64url");
  db()
    .prepare("INSERT INTO push_tokens (name, token_hash, created_at) VALUES (?, ?, ?)")
    .run(name, hashToken(secret), nowIso());
  return { name, secret };
}

/**
 * Read the bearer token off a request and check it. Bearer only: no cookie ever
 * opens /api/v1/, because bundles run their own JavaScript on this origin.
 */
export function authenticatePush(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const secret = header.slice("Bearer ".length).trim();
  if (!secret) return false;

  const row = db()
    .prepare("SELECT id FROM push_tokens WHERE token_hash = ?")
    .get(hashToken(secret)) as { id: number } | undefined;
  if (!row) return false;

  db().prepare("UPDATE push_tokens SET last_used_at = ? WHERE id = ?").run(nowIso(), row.id);
  return true;
}
