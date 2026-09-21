import { createHash, randomBytes } from "node:crypto";
import { db, nowIso } from "@/server/db";
import { PushError } from "@/server/errors";

const PREFIX = "hosti_";

/** Tokens are high-entropy random strings, so a plain digest is the right store. */
export function hashToken(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** How long a push token's name may be. It is a label, not a description. */
export const TOKEN_NAME_MAX_LENGTH = 64;

/** What the owner is told when a typed name will not do. */
export const TOKEN_NAME_RULE = `A push token name is letters, digits, dashes, underscores and spaces, 1 to ${TOKEN_NAME_MAX_LENGTH} characters`;

const TOKEN_NAME_PATTERN = /^[A-Za-z0-9_\- ]+$/;

/**
 * What a revision's `pushed_by` holds when the owner uploaded the archive
 * through the catalog. The leading `@` is the point: `readTokenName` allows
 * letters, digits, dashes, underscores and spaces only, so no push token can
 * ever carry this name and the marker can never be confused with one.
 *
 * It exists so that NULL keeps a single meaning: a revision written before the
 * column existed, where nobody knows how it arrived. Every way in since then
 * records a name, so the catalog never has to guess.
 */
export const CATALOG_UPLOAD = "@catalog";

/**
 * Trim a typed token name down to what gets stored, or refuse it. The name is
 * the only part of a token anybody ever reads back, and it lands in a revision
 * row and on the catalog's own pages, so it stays a plain short label.
 */
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

/**
 * Mint a push token. The secret is returned once and never stored in clear.
 * The name is held to `readTokenName`, so a refusal mints nothing.
 */
export function createPushToken(name: string): { id: number; name: string; secret: string } {
  const checked = readTokenName(name);
  const secret = PREFIX + randomBytes(24).toString("base64url");
  const result = db()
    .prepare("INSERT INTO push_tokens (name, token_hash, created_at) VALUES (?, ?, ?)")
    .run(checked, hashToken(secret), nowIso());
  return { id: result.lastInsertRowid as number, name: checked, secret };
}

/** A push token as the catalog may show it. Never the secret, never the digest. */
export type PushTokenRecord = {
  id: number;
  name: string;
  createdAt: string;
  /** When a push last used it, or null while it has never been used. */
  lastUsedAt: string | null;
};

/**
 * Every push token, newest first. The select names its columns rather than
 * taking `*`, because `token_hash` must never leave this file.
 */
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

/**
 * Revoke one token. The digest goes, so the secret stops opening `/api/v1/`
 * from the next request on. Revisions it already wrote keep its name: they
 * record what happened, not what is still allowed. Returns false when there
 * was no such token, so a caller can tell a revoke from a no-op.
 */
export function deletePushToken(id: number): boolean {
  return db().prepare("DELETE FROM push_tokens WHERE id = ?").run(id).changes > 0;
}

/** Who wrote a revision: the push token a request identified itself with. */
export type PushIdentity = { id: number; name: string };

/**
 * Read the bearer token off a request and check it. Bearer only: no cookie ever
 * opens /api/v1/, because bundles run their own JavaScript on this origin.
 *
 * Returns the token it identified, so a caller can record which one wrote, or
 * null for anything that is not a live token.
 */
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
