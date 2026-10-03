import { Effect } from "effect";
import type { IdentityCrypto, IdentityCryptoError } from "./crypto";

const COST = { N: 16384, r: 8, p: 1 };
const SCRYPT_OPTIONS = { ...COST, maxmem: 64 * 1024 * 1024 };
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const PREFIX = `scrypt:${COST.N}:${COST.r}:${COST.p}`;

export const OWNER_PASSWORD_HASH_PATTERN =
  /^scrypt:16384:8:1:([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{43})$/;

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function canonicalKeyBase64Url(key: string): string {
  const last = BASE64URL.indexOf(key.slice(-1));
  // The last of 43 characters holds 4 key bits; its 2 low bits are unused and decoders ignore them.
  return last < 0 ? key : `${key.slice(0, -1)}${BASE64URL[last & ~3]}`;
}

export function isOwnerPasswordHash(value: string): boolean {
  return OWNER_PASSWORD_HASH_PATTERN.test(value);
}

export function makeOwnerPasswordOperations(crypto: IdentityCrypto["Service"]) {
  // Same format and cost as board-app's owner hash, so either app verifies the other's.
  const derive = (password: string, salt: string) =>
    crypto.deriveScryptBase64Url(password.normalize("NFKC"), salt, SCRYPT_OPTIONS, KEY_BYTES);

  const hashOwnerPassword = Effect.fn("Identity.hashOwnerPassword")(function* (
    password: string,
  ): Effect.fn.Return<string, IdentityCryptoError> {
    const salt = yield* crypto.randomBytesBase64Url(SALT_BYTES);
    const key = yield* derive(password, salt);
    return `${PREFIX}:${salt}:${key}`;
  });

  // A malformed hash, or a failed derivation, is a refusal and never an error.
  const verifyOwnerPassword = Effect.fn("Identity.verifyOwnerPassword")(function* (
    password: string,
    hash: string,
  ): Effect.fn.Return<boolean, IdentityCryptoError> {
    const match = OWNER_PASSWORD_HASH_PATTERN.exec(hash.trim());
    const salt = match?.[1];
    const expected = match?.[2];
    if (salt === undefined || expected === undefined) return false;
    return yield* derive(password, salt).pipe(
      Effect.flatMap((actual) =>
        crypto.constantTimeEquals(canonicalKeyBase64Url(actual), canonicalKeyBase64Url(expected)),
      ),
      Effect.orElseSucceed(() => false),
    );
  });

  return { hashOwnerPassword, verifyOwnerPassword };
}
