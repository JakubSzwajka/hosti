import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, it } from "@effect/vitest";
import { Catalog } from "@hosti/catalog";
import { Effect, FileSystem, Layer, Path } from "effect";
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

it.layer(testIdentityLayer)("Identity auth", (identityTest) => {
  identityTest.effect("signs a value it can read back", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const token = yield* identity.signSession("session-secret", { now: 1000 });
      const session = yield* identity.verifySession("session-secret", token, 1500);

      expect(session).not.toBeNull();
      expect(session?.nonce).toMatch(/^[0-9a-f]{32}$/);
      expect(session?.exp).toBeGreaterThan(1000);
    }),
  );

  identityTest.effect("gives every session its own nonce", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const firstToken = yield* identity.signSession("session-secret", { now: 1000 });
      const secondToken = yield* identity.signSession("session-secret", { now: 1000 });
      const first = yield* identity.verifySession("session-secret", firstToken, 1500);
      const second = yield* identity.verifySession("session-secret", secondToken, 1500);

      expect(first?.nonce).not.toBe(second?.nonce);
    }),
  );

  identityTest.effect("refuses a payload someone edited", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const token = yield* identity.signSession("session-secret", { now: 1000 });
      const [payload, signature] = token.split(".") as [string, string];

      expect(
        yield* identity.verifySession("session-secret", `${payload}x.${signature}`, 1500),
      ).toBe(null);
      expect(
        yield* identity.verifySession("session-secret", `${payload}.${signature}x`, 1500),
      ).toBe(null);
    }),
  );

  identityTest.effect("refuses a cookie signed with another secret", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const token = yield* identity.signSession("another-secret", { now: 1000 });

      expect(yield* identity.verifySession("session-secret", token, 1500)).toBeNull();
    }),
  );

  identityTest.effect("refuses rubbish, an empty value and a missing one", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;

      expect(yield* identity.verifySession("session-secret", undefined, 1500)).toBeNull();
      expect(yield* identity.verifySession("session-secret", "", 1500)).toBeNull();
      expect(yield* identity.verifySession("session-secret", "not-a-session", 1500)).toBeNull();
      expect(yield* identity.verifySession("session-secret", "a.b.c", 1500)).toBeNull();
    }),
  );

  identityTest.effect("refuses a session past its expiry", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const token = yield* identity.signSession("session-secret", {
        now: 1000,
        maxAgeSeconds: 60,
      });

      expect(yield* identity.verifySession("session-secret", token, 61_000)).toBeNull();
      expect(yield* identity.verifySession("session-secret", token, 30_000)).not.toBeNull();
    }),
  );

  identityTest.effect("accepts only the exact string", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;

      expect(yield* identity.constantTimeEquals("hunter2", "hunter2")).toBe(true);
      expect(yield* identity.constantTimeEquals("hunter2", "hunter3")).toBe(false);
      expect(yield* identity.constantTimeEquals("hunter2", "hunter")).toBe(false);
      expect(yield* identity.constantTimeEquals("hunter2", "")).toBe(false);
      expect(yield* identity.constantTimeEquals("hunter2", "hunter22")).toBe(false);
    }),
  );

  identityTest.effect("survives a length mismatch instead of throwing", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;

      expect(yield* identity.constantTimeEquals("a", "a much longer password")).toBe(false);
    }),
  );

  identityTest.effect("matches the value the page renders", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const session = { iat: 1000, exp: 2000, nonce: "session-one" };
      const token = yield* identity.mutationToken("session-secret", session);

      expect(yield* identity.checkMutationToken("session-secret", session, token)).toBe(true);
    }),
  );

  identityTest.effect("rejects a missing, empty or wrong value", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const session = { iat: 1000, exp: 2000, nonce: "session-one" };

      expect(yield* identity.checkMutationToken("session-secret", session, null)).toBe(false);
      expect(yield* identity.checkMutationToken("session-secret", session, "")).toBe(false);
      expect(yield* identity.checkMutationToken("session-secret", session, "guessed")).toBe(false);
    }),
  );

  identityTest.effect("rejects the token from another session", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const session = { iat: 1000, exp: 2000, nonce: "session-one" };
      const other = { iat: 1000, exp: 2000, nonce: "session-two" };
      const token = yield* identity.mutationToken("session-secret", other);

      expect(yield* identity.checkMutationToken("session-secret", session, token)).toBe(false);
    }),
  );

  identityTest.effect("allows a fresh caller", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const limiter = yield* identity.createLoginLimiter();

      expect((yield* limiter.check("1.2.3.4")).allowed).toBe(true);
    }),
  );

  identityTest.effect("locks after the fifth wrong password and says how long", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const limiter = yield* identity.createLoginLimiter({ maxAttempts: 3, lockMs: 60_000 });
      expect((yield* limiter.fail("1.2.3.4", 1000)).allowed).toBe(true);
      expect((yield* limiter.fail("1.2.3.4", 1001)).allowed).toBe(true);
      const third = yield* limiter.fail("1.2.3.4", 1002);
      expect(third.allowed).toBe(false);
      expect(third.allowed === false && third.retryAfterSeconds).toBeLessThanOrEqual(60);
      expect((yield* limiter.check("1.2.3.4", 1003)).allowed).toBe(false);
    }),
  );

  identityTest.effect("counts each caller on its own", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const limiter = yield* identity.createLoginLimiter({ maxAttempts: 2 });
      yield* limiter.fail("1.2.3.4", 1000);
      yield* limiter.fail("1.2.3.4", 1001);

      expect((yield* limiter.check("1.2.3.4", 1002)).allowed).toBe(false);
      expect((yield* limiter.check("5.6.7.8", 1002)).allowed).toBe(true);
    }),
  );

  identityTest.effect("forgets failures older than the window", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const limiter = yield* identity.createLoginLimiter({ maxAttempts: 2, windowMs: 1000 });
      yield* limiter.fail("1.2.3.4", 1000);

      expect((yield* limiter.fail("1.2.3.4", 3000)).allowed).toBe(true);
    }),
  );

  identityTest.effect("opens again once the lock runs out", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const limiter = yield* identity.createLoginLimiter({ maxAttempts: 1, lockMs: 1000 });

      expect((yield* limiter.fail("1.2.3.4", 1000)).allowed).toBe(false);
      expect((yield* limiter.check("1.2.3.4", 2001)).allowed).toBe(true);
    }),
  );

  identityTest.effect("wipes the history on the right password", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const limiter = yield* identity.createLoginLimiter({ maxAttempts: 2 });
      yield* limiter.fail("1.2.3.4", 1000);
      yield* limiter.succeed("1.2.3.4");

      expect((yield* limiter.fail("1.2.3.4", 1001)).allowed).toBe(true);
    }),
  );
});
