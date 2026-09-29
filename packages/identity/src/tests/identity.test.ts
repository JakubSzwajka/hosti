import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, it } from "@effect/vitest";
import { Catalog } from "@hosti/catalog";
import { Effect, FileSystem, Layer, Path } from "effect";
import { TestClock } from "effect/testing";
import { ALL_SCOPES, Identity, IdentityCrypto } from "../index";

let randomSequence = 0;

const fakeCryptoLayer = IdentityCrypto.layer({
  encodeBase64Url(value) {
    return encodeURIComponent(value).replaceAll("%", "_");
  },
  decodeBase64Url(value) {
    return decodeURIComponent(value.replaceAll("_", "%"));
  },
  hmacSha256Base64Url(secret, message) {
    return Effect.succeed(`${secret}:${message}`);
  },
  sha256Hex(value) {
    return Effect.succeed(`digest:${value}`);
  },
  randomBytesHex(size) {
    const next = (randomSequence++).toString(16).padStart(size * 2, "0");
    return Effect.succeed(next.slice(-size * 2));
  },
  randomBytesBase64Url(size) {
    return Effect.succeed(`random-${size}-${randomSequence++}`);
  },
  randomInt() {
    return Effect.succeed(0);
  },
  deriveScryptBase64Url(value) {
    return Effect.succeed(`${value.split("").reverse().join("")}:`.padEnd(43, "x").slice(0, 43));
  },
  constantTimeEquals(left, right) {
    return Effect.succeed(left === right);
  },
});

const catalogPlatform = Layer.mergeAll(NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer);

const testIdentityLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dataDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-identity-" });
    const schemaSql = yield* fs.readFileString(
      path.resolve(import.meta.dirname, "../../../catalog/schema.sql"),
    );
    const catalogLayer = Catalog.layer(dataDir, schemaSql).pipe(
      Layer.provideMerge(catalogPlatform),
    );
    return Identity.layer.pipe(
      Layer.provideMerge(catalogLayer),
      Layer.provideMerge(fakeCryptoLayer),
    );
  }).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))),
);

it.layer(testIdentityLayer)("Identity", (identityTest) => {
  identityTest.effect("signs sessions and rejects a changed payload", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const token = yield* identity.signSession("signing-key", { now: 1000 });
      const session = yield* identity.verifySession("signing-key", token, 1500);
      const [payload, signature] = token.split(".") as [string, string];
      const tampered = yield* identity.verifySession(
        "signing-key",
        `${payload}x.${signature}`,
        1500,
      );

      expect(session).toMatchObject({ iat: 1000, exp: 1000 + 30 * 24 * 60 * 60 * 1000 });
      expect(session?.nonce).toMatch(/^[0-9a-f]{32}$/);
      expect(tampered).toBeNull();
    }),
  );

  identityTest.effect("locks a caller and releases the lock after its timer", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const limiter = yield* identity.createLoginLimiter({ maxAttempts: 2, lockMs: 1000 });
      expect((yield* limiter.fail("caller")).allowed).toBe(true);
      const locked = yield* limiter.fail("caller");
      expect(locked).toEqual({ allowed: false, retryAfterSeconds: 1 });
      yield* TestClock.adjust(1001);
      expect((yield* limiter.check("caller")).allowed).toBe(true);
    }),
  );

  identityTest.effect("hashes and verifies a share pin", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const stored = yield* identity.hashPin("4821");

      expect(stored).toMatch(/^scrypt\$16384\$8\$1\$/);
      expect(yield* identity.verifyPin("4821", stored)).toBe(true);
      expect(yield* identity.verifyPin("4822", stored)).toBe(false);
    }),
  );

  identityTest.effect("authenticates a stored push token", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const minted = yield* identity.createPushToken("test runner", ["share", "publish"]);

      expect(yield* identity.authenticatePush(minted.secret)).toEqual({
        id: minted.id,
        name: "test runner",
        scopes: ["publish", "share"],
      });
      expect(yield* identity.authenticatePush("wrong-token")).toBeNull();
      expect(yield* identity.listPushTokens).toContainEqual(
        expect.objectContaining({
          id: minted.id,
          name: "test runner",
          scopes: ["publish", "share"],
          lastUsedAt: expect.any(String),
        }),
      );
    }),
  );

  identityTest.effect("verifies the pin it was made from", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const hash = yield* identity.hashPin("4821");

      expect(yield* identity.verifyPin("4821", hash)).toBe(true);
    }),
  );

  identityTest.effect("refuses a pin that is not the one", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const hash = yield* identity.hashPin("4821");

      expect(yield* identity.verifyPin("4822", hash)).toBe(false);
      expect(yield* identity.verifyPin("", hash)).toBe(false);
    }),
  );

  identityTest.effect("salts every pin, so the same digits never write the same row", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const first = yield* identity.hashPin("4821");
      const second = yield* identity.hashPin("4821");

      expect(first).not.toBe(second);
      expect(first.startsWith("scrypt$")).toBe(true);
    }),
  );

  identityTest.effect("never keeps the digits anywhere in the hash", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const hash = yield* identity.hashPin("13571357");

      expect(hash).not.toContain("13571357");
    }),
  );

  identityTest.effect("refuses a hash it cannot read", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;

      expect(yield* identity.verifyPin("4821", "")).toBe(false);
      expect(yield* identity.verifyPin("4821", "plaintext")).toBe(false);
      expect(yield* identity.verifyPin("4821", "argon2$1$2$3$4$5")).toBe(false);
    }),
  );

  identityTest.effect("refuses a bad name at the mint itself, whoever calls it", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const before = (yield* identity.listPushTokens).length;
      const slash = yield* Effect.flip(identity.createPushToken("laptop/ci", ALL_SCOPES));
      const blank = yield* Effect.flip(identity.createPushToken(" ", ALL_SCOPES));

      expect(slash.message).toMatch(/push token name/i);
      expect(blank.message).toMatch(/push token name/i);
      expect((yield* identity.listPushTokens).length).toBe(before);
    }),
  );

  identityTest.effect("trims a name and takes the characters it allows", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;

      expect(yield* identity.readTokenName("  laptop  ")).toBe("laptop");
      expect(yield* identity.readTokenName("CI runner_2-b")).toBe("CI runner_2-b");
      expect(yield* identity.readTokenName("x".repeat(64))).toBe("x".repeat(64));
    }),
  );

  identityTest.effect("says so when there was no such token to take away", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;

      expect(yield* identity.deletePushToken(99_999)).toBe(false);
    }),
  );
});
