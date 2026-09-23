import { createHash, randomBytes } from "node:crypto";
import { db, nowIso } from "@/server/db";
import { PushError } from "@/server/errors";

const PREFIX = "hosti_";

export function hashToken(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export const TOKEN_NAME_MAX_LENGTH = 64;

export const TOKEN_NAME_RULE = `A push token name is letters, digits, dashes, underscores and spaces, 1 to ${TOKEN_NAME_MAX_LENGTH} characters`;

const TOKEN_NAME_PATTERN = /^[A-Za-z0-9_\- ]+$/;

export const CATALOG_UPLOAD = "@catalog";

export function readTokenName(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) throw new PushError("bad_token_name", TOKEN_NAME_RULE);
  if (trimmed.length > TOKEN_NAME_MAX_LENGTH) {
    throw new PushError("bad_token_name", TOKEN_NAME_RULE);
  }
  if (!TOKEN_NAME_PATTERN.test(trimmed)) {
    throw new PushError("bad_token_name", TOKEN_NAME_RULE);
  }
  return trimmed;
}

export function createPushToken(name: string): { id: number; name: string; secret: string } {
  const checked = readTokenName(name);
  const secret = PREFIX + randomBytes(24).toString("base64url");
  const result = db()
    .prepare("INSERT INTO push_tokens (name, token_hash, created_at) VALUES (?, ?, ?)")
    .run(checked, hashToken(secret), nowIso());
  return { id: result.lastInsertRowid as number, name: checked, secret };
}

export type PushTokenRecord = {
  id: number;
  name: string;
  createdAt: string;

  lastUsedAt: string | null;
};

export function listPushTokens(): PushTokenRecord[] {
  const rows = db()
    .prepare(
      "SELECT id, name, created_at, last_used_at FROM push_tokens ORDER BY created_at DESC, id DESC",
    )
    .all() as { id: number; name: string; created_at: string; last_used_at: string | null }[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

export function deletePushToken(id: number): boolean {
  return db().prepare("DELETE FROM push_tokens WHERE id = ?").run(id).changes > 0;
}

export type PushIdentity = { id: number; name: string };

export function authenticatePush(request: Request): PushIdentity | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const secret = header.slice("Bearer ".length).trim();
  if (!secret) return null;

  const row = db()
    .prepare("SELECT id, name FROM push_tokens WHERE token_hash = ?")
    .get(hashToken(secret)) as PushIdentity | undefined;
  if (!row) return null;

  db().prepare("UPDATE push_tokens SET last_used_at = ? WHERE id = ?").run(nowIso(), row.id);
  return { id: row.id, name: row.name };
}
