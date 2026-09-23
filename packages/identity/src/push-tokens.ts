import type { Catalog } from "@hosti/catalog";
import { Effect } from "effect";
import type { IdentityCrypto } from "./crypto";
import { IdentityDatabaseError, IdentityInputError } from "./errors";

const PREFIX = "hosti_";

export const TOKEN_NAME_MAX_LENGTH = 64;
export const TOKEN_NAME_RULE = `A push token name is letters, digits, dashes, underscores and spaces, 1 to ${TOKEN_NAME_MAX_LENGTH} characters`;
export const CATALOG_UPLOAD = "@catalog";

const TOKEN_NAME_PATTERN = /^[A-Za-z0-9_\- ]+$/;

export type PushTokenRecord = {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type PushIdentity = { id: number; name: string };

function validateName(value: unknown): Effect.Effect<string, IdentityInputError> {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed.length > TOKEN_NAME_MAX_LENGTH || !TOKEN_NAME_PATTERN.test(trimmed)) {
    return Effect.fail(
      new IdentityInputError({
        code: "bad_token_name",
        message: TOKEN_NAME_RULE,
        status: 400,
      }),
    );
  }
  return Effect.succeed(trimmed);
}

function databaseOperation<A>(
  operation: string,
  run: () => A,
): Effect.Effect<A, IdentityDatabaseError> {
  return Effect.try({
    try: run,
    catch: (cause) => new IdentityDatabaseError({ operation, cause }),
  });
}

export function makePushTokenOperations(dependencies: {
  catalog: Catalog["Service"];
  crypto: IdentityCrypto["Service"];
}) {
  const { catalog, crypto } = dependencies;

  const readTokenName = (value: unknown) => validateName(value);

  const hashToken = (secret: string) => crypto.sha256Hex(secret);

  const createPushToken = Effect.fn("Identity.createPushToken")(function* (name: string) {
    const checked = yield* validateName(name);
    const secret = `${PREFIX}${yield* crypto.randomBytesBase64Url(24)}`;
    const tokenHash = yield* hashToken(secret);
    const createdAt = yield* catalog.nowIso;
    const database = yield* catalog.database;
    const result = yield* databaseOperation("createPushToken", () =>
      database
        .prepare("INSERT INTO push_tokens (name, token_hash, created_at) VALUES (?, ?, ?)")
        .run(checked, tokenHash, createdAt),
    );
    return { id: result.lastInsertRowid as number, name: checked, secret };
  });

  const listPushTokens = Effect.fn("Identity.listPushTokens")(function* () {
    const database = yield* catalog.database;
    const rows = yield* databaseOperation(
      "listPushTokens",
      () =>
        database
          .prepare(
            "SELECT id, name, created_at, last_used_at FROM push_tokens ORDER BY created_at DESC, id DESC",
          )
          .all() as { id: number; name: string; created_at: string; last_used_at: string | null }[],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));
  });

  const deletePushToken = Effect.fn("Identity.deletePushToken")(function* (id: number) {
    const database = yield* catalog.database;
    const result = yield* databaseOperation("deletePushToken", () =>
      database.prepare("DELETE FROM push_tokens WHERE id = ?").run(id),
    );
    return result.changes > 0;
  });

  const authenticatePush = Effect.fn("Identity.authenticatePush")(function* (
    secret: string | null,
  ) {
    if (!secret) return null;
    const tokenHash = yield* hashToken(secret);
    const database = yield* catalog.database;
    const row = yield* databaseOperation(
      "authenticatePush",
      () =>
        database.prepare("SELECT id, name FROM push_tokens WHERE token_hash = ?").get(tokenHash) as
          | PushIdentity
          | undefined,
    );
    if (!row) return null;
    const lastUsedAt = yield* catalog.nowIso;
    yield* databaseOperation("markPushTokenUsed", () =>
      database
        .prepare("UPDATE push_tokens SET last_used_at = ? WHERE id = ?")
        .run(lastUsedAt, row.id),
    );
    return { id: row.id, name: row.name };
  });

  return {
    readTokenName,
    hashToken,
    createPushToken,
    listPushTokens,
    deletePushToken,
    authenticatePush,
  };
}
