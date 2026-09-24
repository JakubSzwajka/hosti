import type { IdentityCrypto, IdentityCryptoError } from "@hosti/identity";
import { Clock, Effect, Schema } from "effect";
import { UNLOCK_COOKIE_PREFIX, UNLOCK_MAX_AGE_SECONDS, type UnlockBinding } from "./types";

type UnlockOperations = {
  unlockCookieName(shareSlug: string): Effect.Effect<string>;
  signUnlock(
    secret: string,
    shareSlug: string,
    binding: UnlockBinding,
    options?: { now?: number; maxAgeSeconds?: number },
  ): Effect.Effect<string, IdentityCryptoError>;
  verifyUnlock(
    secret: string,
    shareSlug: string,
    binding: UnlockBinding,
    value: string | null | undefined,
    suppliedNow?: number,
  ): Effect.Effect<boolean, IdentityCryptoError>;
};

const UnlockClaimsSchema = Schema.Struct({
  slug: Schema.String,
  exp: Schema.Finite,
});

export function makeUnlockOperations(crypto: IdentityCrypto["Service"]): UnlockOperations {
  const sign = Effect.fnUntraced(function* (
    secret: string,
    payload: string,
    binding: UnlockBinding,
  ) {
    return yield* crypto.hmacSha256Base64Url(
      secret,
      `${payload}\u0000${String(binding.bundleId)}\u0000${binding.pinHash}`,
    );
  });

  const unlockCookieName = (shareSlug: string) =>
    Effect.succeed(`${UNLOCK_COOKIE_PREFIX}${shareSlug}`);

  const signUnlock = Effect.fn("Serving.signUnlock")(function* (
    secret: string,
    shareSlug: string,
    binding: UnlockBinding,
    options: { now?: number; maxAgeSeconds?: number } = {},
  ) {
    const now = options.now ?? (yield* Clock.currentTimeMillis);
    const maxAge = options.maxAgeSeconds ?? UNLOCK_MAX_AGE_SECONDS;
    const nonce = yield* crypto.randomBytesHex(8);
    const payload = crypto.encodeBase64Url(
      JSON.stringify({ slug: shareSlug, iat: now, exp: now + maxAge * 1000, nonce }),
    );
    return `${payload}.${yield* sign(secret, payload, binding)}`;
  });

  const verifyUnlock = Effect.fn("Serving.verifyUnlock")(function* (
    secret: string,
    shareSlug: string,
    binding: UnlockBinding,
    value: string | null | undefined,
    suppliedNow?: number,
  ) {
    if (!value) return false;
    const parts = value.split(".");
    if (parts.length !== 2) return false;
    const payload = parts[0];
    const signature = parts[1];
    if (!payload || !signature) return false;
    const expected = yield* sign(secret, payload, binding);
    if (!(yield* crypto.constantTimeEquals(expected, signature))) return false;

    const parsed = yield* Schema.decodeEffect(Schema.fromJsonString(UnlockClaimsSchema))(
      crypto.decodeBase64Url(payload),
    ).pipe(Effect.orElseSucceed(() => null));
    if (!parsed || parsed.slug !== shareSlug) return false;
    const now = suppliedNow ?? (yield* Clock.currentTimeMillis);
    return parsed.exp > now;
  });

  return { unlockCookieName, signUnlock, verifyUnlock };
}
