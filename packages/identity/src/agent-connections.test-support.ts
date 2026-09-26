import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { Catalog } from "@hosti/catalog";
import { Effect, FileSystem, Layer, Path } from "effect";
import { makeAgentConnectionStore, type TokenStore } from "./agent-connections";
import { Identity, IdentityCrypto } from "./index";

let sequence = 0;

export function fakeSha256(value: string): string {
  const hex = [...value].map((char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  return hex.padEnd(64, "0").slice(0, 64);
}

export function fakeCryptoService(): IdentityCrypto["Service"] {
  return {
    encodeBase64Url: (value) => value,
    decodeBase64Url: (value) => value,
    hmacSha256Base64Url: (secret, message) => Effect.succeed(`${secret}:${message}`),
    sha256Hex: (value) => Effect.succeed(fakeSha256(value)),
    randomBytesHex: (size) => Effect.succeed(String(sequence++).padStart(size * 2, "0")),
    randomBytesBase64Url: (size) => Effect.succeed(`id-${size}-${sequence++}`.padEnd(32, "x")),
    randomInt: (max) => Effect.succeed(sequence++ % max),
    deriveScryptBase64Url: (value) => Effect.succeed(value),
    constantTimeEquals: (left, right) => Effect.succeed(left === right),
  };
}

const fakeCryptoLayer = IdentityCrypto.layer(fakeCryptoService());

export const directAgentConnectionStore = (tokens: TokenStore) =>
  makeAgentConnectionStore({ crypto: fakeCryptoService(), tokens });

const catalogPlatform = Layer.mergeAll(NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer);

export const freshIdentity = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dataDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-connections-" });
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

export const NOW = 1_800_000_000_000;

export function request(name: string, overrides: Record<string, unknown> = {}) {
  return {
    tokenName: name,
    tokenDigest: fakeSha256(`token-${name}`),
    pollingDigest: fakeSha256(`poll-${name}`),
    scopes: ["publish", "share"],
    ...overrides,
  };
}
