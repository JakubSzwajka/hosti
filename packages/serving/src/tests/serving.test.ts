import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, it } from "@effect/vitest";
import { IdentityCrypto } from "@hosti/identity";
import { Effect, FileSystem, Layer, Path } from "effect";
import { TestClock } from "effect/testing";
import { Serving, PREVIEW_TOKEN_TTL_MS } from "../index";

const cryptoLayer = IdentityCrypto.layer({
  encodeBase64Url(value) {
    return Buffer.from(value).toString("base64url");
  },
  decodeBase64Url(value) {
    return Buffer.from(value, "base64url").toString("utf8");
  },
  hmacSha256Base64Url(secret, message) {
    return Effect.succeed(`signature:${secret}:${message}`);
  },
  sha256Hex(value) {
    return Effect.succeed(`digest:${value}`);
  },
  randomBytesHex() {
    return Effect.succeed("0123456789abcdef");
  },
  randomBytesBase64Url(size) {
    return Effect.succeed(`random-${size}`);
  },
  deriveScryptBase64Url(value) {
    return Effect.succeed(value);
  },
  constantTimeEquals(left, right) {
    return Effect.succeed(left === right);
  },
});

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, cryptoLayer);
const servingLayer = Serving.layer.pipe(Layer.provideMerge(platformLayer));

it.layer(servingLayer)("Serving", (servingTest) => {
  servingTest.effect("maps bundle file extensions to content types", () =>
    Effect.gen(function* () {
      const serving = yield* Serving;

      expect(yield* serving.contentTypeFor("/bundle/photo.JPG")).toBe("image/jpeg");
      expect(yield* serving.contentTypeFor("/bundle/data.map")).toBe(
        "application/json; charset=utf-8",
      );
      expect(yield* serving.contentTypeFor("/bundle/file.unknown")).toBe(
        "application/octet-stream",
      );
    }),
  );

  servingTest.effect("expires preview tokens using the Effect clock and rejects tampering", () =>
    Effect.gen(function* () {
      const serving = yield* Serving;
      const token = yield* serving.signPreviewToken("secret", "demo");
      const changed = token.slice(0, -1) + (token.endsWith("x") ? "y" : "x");

      expect(yield* serving.verifyPreviewToken("secret", "demo", token)).toBe(true);
      expect(yield* serving.verifyPreviewToken("secret", "demo", changed)).toBe(false);
      yield* TestClock.adjust(PREVIEW_TOKEN_TTL_MS + 1);
      expect(yield* serving.verifyPreviewToken("secret", "demo", token)).toBe(false);
    }),
  );

  servingTest.effect("signs and verifies unlock cookies", () =>
    Effect.gen(function* () {
      const serving = yield* Serving;
      const binding = { bundleId: 19, pinHash: "pin-hash" };
      const token = yield* serving.signUnlock("secret", "share", binding, { now: 1000 });
      const changed = token.slice(0, -1) + (token.endsWith("x") ? "y" : "x");

      expect(yield* serving.unlockCookieName("share")).toBe("hosti_pin_share");
      expect(yield* serving.verifyUnlock("secret", "share", binding, token, 1000)).toBe(true);
      expect(yield* serving.verifyUnlock("secret", "share", binding, changed, 1000)).toBe(false);
    }),
  );

  servingTest.effect("resolves index, nested, missing, and traversal paths inside a revision", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const serving = yield* Serving;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-serving-" });
      const root = path.join(tempDir, "revision");
      yield* fs.makeDirectory(path.join(root, "nested"), { recursive: true });
      yield* fs.writeFileString(path.join(root, "index.html"), "root");
      yield* fs.writeFileString(path.join(root, "nested", "index.html"), "nested");
      yield* fs.writeFileString(path.join(root, "404.html"), "missing");

      expect(yield* serving.resolveBundleRequest(root, "/v/demo", "/")).toEqual({
        kind: "file",
        absolutePath: path.join(root, "index.html"),
      });
      expect(yield* serving.resolveBundleRequest(root, "/v/demo", "/nested/")).toEqual({
        kind: "file",
        absolutePath: path.join(root, "nested", "index.html"),
      });
      expect(yield* serving.resolveBundleRequest(root, "/v/demo", "/missing")).toEqual({
        kind: "not-found",
      });
      expect(yield* serving.bundleNotFoundFile(root)).toBe(path.join(root, "404.html"));
      expect(yield* serving.resolveBundleRequest(root, "/v/demo", "/%2e%2e/escape.html")).toEqual({
        kind: "not-found",
      });
    }),
  );

  servingTest.effect("requires the pin gate for a locked share page", () =>
    Effect.gen(function* () {
      const serving = yield* Serving;

      expect(
        yield* serving.decideBundleAccess({
          shareExists: true,
          pinProtected: true,
          unlocked: false,
          canRenderGate: true,
        }),
      ).toEqual({ kind: "gate-required" });
    }),
  );

  servingTest.effect("refuses a grant minted for another link", () =>
    Effect.gen(function* () {
      const serving = yield* Serving;
      const binding = { bundleId: 7, pinHash: "scrypt$16384$8$1$salt$key" };
      const stolen = yield* serving.signUnlock("secret", "some-other-link", binding, {
        now: 1000,
      });

      expect(yield* serving.verifyUnlock("secret", "this-link", binding, stolen, 1000)).toBe(false);
      expect(yield* serving.verifyUnlock("secret", "some-other-link", binding, stolen, 1000)).toBe(
        true,
      );
    }),
  );

  servingTest.effect("refuses a grant minted for another bundle on the same slug", () =>
    Effect.gen(function* () {
      const serving = yield* Serving;
      const binding = { bundleId: 7, pinHash: "scrypt$16384$8$1$salt$key" };
      const grant = yield* serving.signUnlock("secret", "reused-slug", binding, { now: 1000 });
      const otherBundle = { bundleId: binding.bundleId + 1, pinHash: binding.pinHash };

      expect(yield* serving.verifyUnlock("secret", "reused-slug", binding, grant, 1000)).toBe(true);
      expect(yield* serving.verifyUnlock("secret", "reused-slug", otherBundle, grant, 1000)).toBe(
        false,
      );
    }),
  );

  servingTest.effect("refuses a grant once the pin behind it has changed", () =>
    Effect.gen(function* () {
      const serving = yield* Serving;
      const binding = { bundleId: 7, pinHash: "scrypt$16384$8$1$salt$key" };
      const grant = yield* serving.signUnlock("secret", "pin-moved", binding, { now: 1000 });
      const newPin = { bundleId: binding.bundleId, pinHash: "scrypt$16384$8$1$other$hash" };

      expect(yield* serving.verifyUnlock("secret", "pin-moved", binding, grant, 1000)).toBe(true);
      expect(yield* serving.verifyUnlock("secret", "pin-moved", newPin, grant, 1000)).toBe(false);
    }),
  );

  servingTest.effect("refuses a grant that has run out", () =>
    Effect.gen(function* () {
      const serving = yield* Serving;
      const binding = { bundleId: 7, pinHash: "scrypt$16384$8$1$salt$key" };
      const grant = yield* serving.signUnlock("secret", "expiring", binding, {
        now: 1000,
        maxAgeSeconds: 60,
      });

      expect(yield* serving.verifyUnlock("secret", "expiring", binding, grant, 1000)).toBe(true);
      expect(yield* serving.verifyUnlock("secret", "expiring", binding, grant, 61_001)).toBe(false);
    }),
  );

  servingTest.effect("refuses a grant signed with another key, or edited", () =>
    Effect.gen(function* () {
      const serving = yield* Serving;
      const binding = { bundleId: 7, pinHash: "scrypt$16384$8$1$salt$key" };
      const grant = yield* serving.signUnlock("secret", "signed", binding, { now: 1000 });
      const changed = grant.slice(0, -1) + (grant.endsWith("x") ? "y" : "x");

      expect(yield* serving.verifyUnlock("another-key", "signed", binding, grant, 1000)).toBe(
        false,
      );
      expect(yield* serving.verifyUnlock("secret", "signed", binding, changed, 1000)).toBe(false);
      expect(yield* serving.verifyUnlock("secret", "signed", binding, null, 1000)).toBe(false);
    }),
  );

  servingTest.effect("keeps the bundle id and the pin hash out of the cookie", () =>
    Effect.gen(function* () {
      const serving = yield* Serving;
      const binding = { bundleId: 7, pinHash: "scrypt$16384$8$1$salt$key" };
      const grant = yield* serving.signUnlock("secret", "opaque", binding, { now: 1000 });
      const [payload] = grant.split(".") as [string];
      const claims = Buffer.from(payload, "base64url").toString("utf8");

      expect(claims).not.toContain(binding.pinHash);
      expect(claims).toContain("opaque");
    }),
  );
});
