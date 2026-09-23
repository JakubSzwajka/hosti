import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { Catalog, openDatabaseAt, type CatalogError } from "@hosti/catalog";
import { Identity, IdentityInputError } from "@hosti/identity";
import { Storage } from "@hosti/storage";
import type Database from "better-sqlite3";
import { ConfigProvider, Effect, Layer, ManagedRuntime } from "effect";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PushError } from "@/server/errors";
import { dataDir } from "@/server/config";
import { NodeIdentityCrypto } from "@/server/node-crypto";
import { NodeArchiveCodec } from "@/server/storage/node-archive-codec";

const catalogSchemaFile = path.resolve(process.cwd(), "../../packages/catalog/schema.sql");
const catalogSchemaSql = readFileSync(catalogSchemaFile, "utf8");

const platformLayer = Layer.mergeAll(
  NodeCrypto.layer,
  NodeFileSystem.layer,
  NodePath.layer,
  NodeArchiveCodec.layer,
  NodeIdentityCrypto,
);
const catalogLayer = Catalog.layer(dataDir(), catalogSchemaSql);
const identityLayer = Identity.layer.pipe(Layer.provideMerge(catalogLayer));
const runtimeLayer = Layer.mergeAll(identityLayer, Storage.layer).pipe(
  Layer.provideMerge(platformLayer),
);
const runtime = ManagedRuntime.make(runtimeLayer);

export function runOpenDatabaseSync(databaseFile: string): Database.Database {
  mkdirSync(path.dirname(databaseFile), { recursive: true });
  return runtime.runSync(openDatabaseAt(databaseFile, catalogSchemaSql));
}

export function runCatalogSync<A, E>(use: (catalog: Catalog["Service"]) => Effect.Effect<A, E>): A {
  const activeDataDir = dataDir();
  mkdirSync(activeDataDir, { recursive: true });
  return runtime.runSync(
    Catalog.use((catalog) =>
      Effect.gen(function* () {
        yield* catalog.setDataDir(activeDataDir);
        return yield* use(catalog);
      }),
    ),
  );
}

export function runStorageSync<A, E>(use: (storage: Storage["Service"]) => Effect.Effect<A, E>): A {
  return runtime.runSync(Storage.use(use));
}

export function runStoragePromise<A, E>(
  use: (storage: Storage["Service"]) => Effect.Effect<A, E>,
): Promise<A> {
  return runtime.runPromise(Storage.use(use));
}

function mapIdentityError(error: unknown): never {
  if (error instanceof IdentityInputError) {
    throw new PushError(error.code, error.message, error.status);
  }
  throw error;
}

function identityEffect<A, E>(
  use: (identity: Identity["Service"]) => Effect.Effect<A, E>,
): Effect.Effect<A, E | CatalogError, Catalog | Identity> {
  const activeDataDir = dataDir();
  mkdirSync(activeDataDir, { recursive: true });
  return Catalog.use((catalog) =>
    Effect.gen(function* () {
      yield* catalog.setDataDir(activeDataDir);
      const identity = yield* Identity;
      return yield* use(identity);
    }),
  ).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv())));
}

export function runIdentitySync<A, E>(
  use: (identity: Identity["Service"]) => Effect.Effect<A, E>,
): A {
  const result = runtime.runSync(
    identityEffect(use).pipe(
      Effect.match({
        onFailure: (error) => ({ ok: false as const, error }),
        onSuccess: (value) => ({ ok: true as const, value }),
      }),
    ),
  );
  if (!result.ok) return mapIdentityError(result.error);
  return result.value;
}

export function runIdentityPromise<A, E>(
  use: (identity: Identity["Service"]) => Effect.Effect<A, E>,
): Promise<A> {
  return runtime
    .runPromise(
      identityEffect(use).pipe(
        Effect.match({
          onFailure: (error) => ({ ok: false as const, error }),
          onSuccess: (value) => ({ ok: true as const, value }),
        }),
      ),
    )
    .then((result) => {
      if (!result.ok) return mapIdentityError(result.error);
      return result.value;
    });
}
