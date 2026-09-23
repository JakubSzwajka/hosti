import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, it } from "@effect/vitest";
import { Catalog } from "@hosti/catalog";
import { Effect, FileSystem, Layer, Path } from "effect";
import { TestClock } from "effect/testing";
import { Identity, IdentityCrypto } from "./index";

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
  deriveScryptBase64Url(value) {
    return Effect.succeed(`${value}:`.padEnd(43, "x").slice(0, 43));
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
      path.resolve(import.meta.dirname, "../../catalog/schema.sql"),
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
      const minted = yield* identity.createPushToken("test runner");

      expect(yield* identity.authenticatePush(minted.secret)).toEqual({
        id: minted.id,
        name: "test runner",
      });
      expect(yield* identity.authenticatePush("wrong-token")).toBeNull();
      expect(yield* identity.listPushTokens).toContainEqual(
        expect.objectContaining({
          id: minted.id,
          name: "test runner",
          lastUsedAt: expect.any(String),
        }),
      );
    }),
  );
});
