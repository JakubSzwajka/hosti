import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { IdentityCrypto, isOwnerPasswordHash } from "../index";
import { makeOwnerPasswordOperations } from "../owner-password";

const HASH = `scrypt:16384:8:1:${"a".repeat(22)}:${"b".repeat(43)}`;

it("accepts only board-app's exact hash shape", () => {
  expect(isOwnerPasswordHash(HASH)).toBe(true);
  for (const value of [
    "",
    "hunter2",
    HASH.replace(":16384:", ":16385:"),
    HASH.replace(":8:1:", ":8:2:"),
    HASH.slice(0, -1),
    `${HASH}b`,
    `${HASH}\n`,
    HASH.replace("scrypt", "argon2"),
    HASH.replace("a", "$"),
  ]) {
    expect(isOwnerPasswordHash(value)).toBe(false);
  }
});

it.effect("derives with the normalised password, the fixed cost and a 32 byte key", () =>
  Effect.gen(function* () {
    const calls: Array<{ value: string; salt: string; cost: object; keyBytes: number }> = [];
    const crypto = yield* IdentityCrypto.use((service) => Effect.succeed(service)).pipe(
      Effect.provide(
        IdentityCrypto.layer({
          encodeBase64Url: (value) => value,
          decodeBase64Url: (value) => value,
          hmacSha256Base64Url: () => Effect.succeed(""),
          sha256Hex: () => Effect.succeed(""),
          randomBytesHex: () => Effect.succeed(""),
          randomBytesBase64Url: (size) => Effect.succeed("s".repeat(size === 16 ? 22 : 1)),
          deriveScryptBase64Url: (value, salt, cost, keyBytes) => {
            calls.push({ value, salt, cost, keyBytes });
            return Effect.succeed("k".repeat(43));
          },
          constantTimeEquals: (left, right) => Effect.succeed(left === right),
        }),
      ),
    );
    const owner = makeOwnerPasswordOperations(crypto);
    const hash = yield* owner.hashOwnerPassword("ｐａｓｓ ①");
    expect(hash).toBe(`scrypt:16384:8:1:${"s".repeat(22)}:${"k".repeat(43)}`);
    expect(calls[0]).toMatchObject({
      value: "pass 1",
      keyBytes: 32,
      cost: { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    });
    expect(yield* owner.verifyOwnerPassword("ｐａｓｓ ①", hash)).toBe(true);
    expect(yield* owner.verifyOwnerPassword("x", hash)).toBe(true); // the fake derives one key for all

    const before = calls.length;
    expect(yield* owner.verifyOwnerPassword("pass 1", "not a hash")).toBe(false);
    expect(calls.length).toBe(before);
  }),
);

it.effect("compares decoded key bytes, not the spelling of the last character", () =>
  Effect.gen(function* () {
    const derived = `${"k".repeat(42)}A`; // 'A' leaves the two unused low bits at zero
    const crypto = yield* IdentityCrypto.use((service) => Effect.succeed(service)).pipe(
      Effect.provide(
        IdentityCrypto.layer({
          encodeBase64Url: (value) => value,
          decodeBase64Url: (value) => value,
          hmacSha256Base64Url: () => Effect.succeed(""),
          sha256Hex: () => Effect.succeed(""),
          randomBytesHex: () => Effect.succeed(""),
          randomBytesBase64Url: () => Effect.succeed("s".repeat(22)),
          deriveScryptBase64Url: () => Effect.succeed(derived),
          constantTimeEquals: (left, right) => Effect.succeed(left === right),
        }),
      ),
    );
    const owner = makeOwnerPasswordOperations(crypto);
    const hashWith = (key: string) => `scrypt:16384:8:1:${"s".repeat(22)}:${key}`;

    expect(yield* owner.verifyOwnerPassword("x", hashWith(derived))).toBe(true);
    // 'B', 'C' and 'D' differ from 'A' only in unused bits: the same 32 bytes.
    for (const last of ["B", "C", "D"]) {
      expect(yield* owner.verifyOwnerPassword("x", hashWith(`${"k".repeat(42)}${last}`))).toBe(
        true,
      );
    }
    // 'E' changes a used bit, and so does a different first character.
    expect(yield* owner.verifyOwnerPassword("x", hashWith(`${"k".repeat(42)}E`))).toBe(false);
    expect(yield* owner.verifyOwnerPassword("x", hashWith(`j${"k".repeat(41)}A`))).toBe(false);
  }),
);
