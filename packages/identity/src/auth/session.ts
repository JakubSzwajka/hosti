import { Clock, Effect, Schema } from "effect";
import type { IdentityCrypto } from "../crypto";

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type AdminSession = {
  iat: number;
  exp: number;
  nonce: string;
};

const AdminSessionSchema = Schema.Struct({
  iat: Schema.Finite,
  exp: Schema.Finite,
  nonce: Schema.String,
});

export function makeSessionOperations(crypto: IdentityCrypto["Service"]) {
  const signSession = Effect.fn("Identity.signSession")(function* (
    secret: string,
    options: { now?: number; maxAgeSeconds?: number } = {},
  ) {
    const now = options.now ?? (yield* Clock.currentTimeMillis);
    const maxAge = options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
    const session: AdminSession = {
      iat: now,
      exp: now + maxAge * 1000,
      nonce: yield* crypto.randomBytesHex(16),
    };
    const payload = crypto.encodeBase64Url(JSON.stringify(session));
    const signature = yield* crypto.hmacSha256Base64Url(secret, payload);
    return `${payload}.${signature}`;
  });

  const verifySession = Effect.fn("Identity.verifySession")(function* (
    secret: string,
    value: string | undefined | null,
    suppliedNow?: number,
  ) {
    if (!value) return null;
    const parts = value.split(".");
    if (parts.length !== 2) return null;
    const [payload, signature] = parts as [string, string];
    const expected = yield* crypto.hmacSha256Base64Url(secret, payload);
    if (!(yield* crypto.constantTimeEquals(expected, signature))) return null;

    const parsed = yield* Schema.decodeEffect(Schema.fromJsonString(AdminSessionSchema))(
      crypto.decodeBase64Url(payload),
    ).pipe(Effect.orElseSucceed(() => null));
    if (!parsed) return null;
    const now = suppliedNow ?? (yield* Clock.currentTimeMillis);
    if (parsed.exp <= now) return null;
    return parsed;
  });

  const mutationToken = Effect.fn("Identity.mutationToken")(function* (
    secret: string,
    session: AdminSession,
  ) {
    return yield* crypto.hmacSha256Base64Url(secret, `hosti-mutation:${session.nonce}`);
  });

  const checkMutationToken = Effect.fn("Identity.checkMutationToken")(function* (
    secret: string,
    session: AdminSession,
    supplied: string | null | undefined,
  ) {
    if (!supplied) return false;
    const expected = yield* mutationToken(secret, session);
    return yield* crypto.constantTimeEquals(expected, supplied);
  });

  return { signSession, verifySession, mutationToken, checkMutationToken };
}
