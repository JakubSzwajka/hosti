import type { Catalog } from "@hosti/catalog";
import type { PushScope } from "@hosti/shared";
import { Effect } from "effect";
import type { IdentityCrypto } from "./crypto";
import { IdentityDatabaseError, IdentityInputError } from "./errors";
import { formatScopes, orderScopes, parseStoredScopes } from "./scopes";

const PREFIX = "hosti_";

export const TOKEN_NAME_MAX_LENGTH = 64;
export const TOKEN_NAME_RULE = `A push token name is letters, digits, dashes, underscores and spaces, 1 to ${TOKEN_NAME_MAX_LENGTH} characters`;
export const CATALOG_UPLOAD = "@catalog";

const TOKEN_NAME_PATTERN = /^[A-Za-z0-9_\- ]+$/;
const BEARER_PREFIX = "Bearer ";

export function bearerSecret(authorization: string | null): string | null {
  if (!authorization?.startsWith(BEARER_PREFIX)) return null;
  return authorization.slice(BEARER_PREFIX.length).trim() || null;
}

export type PushTokenRecord = {
  id: number;
  name: string;
  scopes: PushScope[];
  createdAt: string;
  lastUsedAt: string | null;
};

export type PushIdentity = { id: number; name: string; scopes: PushScope[] };

export const TOKEN_EXISTS_MESSAGE = "That token digest is already in use";

type TokenRow = { id: number; name: string; scopes: string };

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

  const insertPushToken = Effect.fn("Identity.insertPushToken")(function* (input: {
    name: string;
    tokenHash: string;
    scopes: readonly PushScope[];
  }) {
    const checked = yield* validateName(input.name);
    const scopes = orderScopes(input.scopes);
    const createdAt = yield* catalog.nowIso;
    const database = yield* catalog.database;
    const result = yield* Effect.try({
      try: () =>
        database
          .prepare(
            "INSERT INTO push_tokens (name, token_hash, created_at, scopes) VALUES (?, ?, ?, ?)",
          )
          .run(checked, input.tokenHash, createdAt, formatScopes(scopes)),
      catch: (cause) =>
        String(cause).includes("UNIQUE")
          ? new IdentityInputError({
              code: "token_exists",
              message: TOKEN_EXISTS_MESSAGE,
              status: 409,
            })
          : new IdentityDatabaseError({ operation: "insertPushToken", cause }),
    });
    return { id: Number(result.lastInsertRowid), name: checked, scopes };
  });

  /** Mints a token and hands back its secret. Only the server shell and tests do this. */
  const createPushToken = Effect.fn("Identity.createPushToken")(function* (
    name: string,
    scopes: readonly PushScope[],
  ) {
    const secret = `${PREFIX}${yield* crypto.randomBytesBase64Url(24)}`;
    const tokenHash = yield* hashToken(secret);
    const created = yield* insertPushToken({ name, tokenHash, scopes });
    return { ...created, secret };
  });

  /** Stores a digest the agent made. The server never sees the clear token. */
  const activatePushToken = Effect.fn("Identity.activatePushToken")(function* (input: {
    name: string;
    tokenDigest: string;
    scopes: readonly PushScope[];
  }) {
    return yield* insertPushToken({
      name: input.name,
      tokenHash: input.tokenDigest,
      scopes: input.scopes,
    });
  });

  const pushTokenDigestExists = Effect.fn("Identity.pushTokenDigestExists")(function* (
    tokenDigest: string,
  ) {
    const database = yield* catalog.database;
    const row = yield* databaseOperation("pushTokenDigestExists", () =>
      database.prepare("SELECT 1 AS found FROM push_tokens WHERE token_hash = ?").get(tokenDigest),
    );
    return row !== undefined;
  });

  const listPushTokens = Effect.fn("Identity.listPushTokens")(function* () {
    const database = yield* catalog.database;
    const rows = yield* databaseOperation(
      "listPushTokens",
      () =>
        database
          .prepare(
            "SELECT id, name, scopes, created_at, last_used_at FROM push_tokens ORDER BY created_at DESC, id DESC",
          )
          .all() as (TokenRow & { created_at: string; last_used_at: string | null })[],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      scopes: parseStoredScopes(row.scopes),
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
        database
          .prepare("SELECT id, name, scopes FROM push_tokens WHERE token_hash = ?")
          .get(tokenHash) as TokenRow | undefined,
    );
    if (!row) return null;
    const lastUsedAt = yield* catalog.nowIso;
    yield* databaseOperation("markPushTokenUsed", () =>
      database
        .prepare("UPDATE push_tokens SET last_used_at = ? WHERE id = ?")
        .run(lastUsedAt, row.id),
    );
    return { id: row.id, name: row.name, scopes: parseStoredScopes(row.scopes) };
  });

  return {
    readTokenName,
    hashToken,
    createPushToken,
    activatePushToken,
    pushTokenDigestExists,
    listPushTokens,
    deletePushToken,
    authenticatePush,
  };
}
