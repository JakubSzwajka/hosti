import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { Catalog, CatalogError, openDatabaseAt } from "@hosti/catalog";
import { BundlesError } from "@hosti/bundles";
import { Storage, StorageError } from "@hosti/storage";
import { Identity, IdentityInputError } from "@hosti/identity";
import { Serving } from "@hosti/serving";
import { LoginThrottle } from "@/use-cases/login";
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
const identityAndLoginLayer = LoginThrottle.layer.pipe(Layer.provideMerge(identityLayer));
const runtimeLayer = Layer.mergeAll(identityAndLoginLayer, Storage.layer, Serving.layer).pipe(
  Layer.provideMerge(platformLayer),
);
const runtime = ManagedRuntime.make(runtimeLayer);

export type UseCaseResult<A, E> = { ok: true; value: A } | { ok: false; error: E };

export type UseCaseRequirements =
  | Catalog
  | Storage
  | Identity
  | Serving
  | LoginThrottle
  | import("effect").FileSystem.FileSystem
  | import("effect").Path.Path
  | import("effect/Crypto").Crypto
  | import("@hosti/storage").ArchiveCodec
  | import("@hosti/identity").IdentityCrypto;

export function runUseCase<A, E, R extends UseCaseRequirements>(
  effect: Effect.Effect<A, E, R>,
): Promise<UseCaseResult<A, E | CatalogError>> {
  const activeDataDir = dataDir();
  mkdirSync(activeDataDir, { recursive: true });
  const configured = Catalog.use((catalog) =>
    Effect.gen(function* () {
      // Production fixes the data dir per process; only tests switch it.
      yield* catalog.setDataDir(activeDataDir);
      return yield* effect;
    }),
  ).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv())));
  return runtime.runPromise(
    configured.pipe(
      Effect.match({
        onFailure: (error) => ({ ok: false as const, error }),
        onSuccess: (value) => ({ ok: true as const, value }),
      }),
    ),
  );
}

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

export function runServingSync<A, E>(use: (serving: Serving["Service"]) => Effect.Effect<A, E>): A {
  return runtime.runSync(Serving.use(use));
}

export function runServingPromise<A, E>(
  use: (serving: Serving["Service"]) => Effect.Effect<A, E>,
): Promise<A> {
  return runtime.runPromise(Serving.use(use));
}

type BundleRequirements =
  | Catalog
  | Storage
  | import("effect").FileSystem.FileSystem
  | import("effect").Path.Path
  | import("effect/Crypto").Crypto
  | import("@hosti/storage").ArchiveCodec
  | import("@hosti/identity").IdentityCrypto
  | Identity;

function bundleEffect<A, E, R extends BundleRequirements>(effect: Effect.Effect<A, E, R>) {
  const activeDataDir = dataDir();
  mkdirSync(activeDataDir, { recursive: true });
  return Catalog.use((catalog) =>
    Effect.gen(function* () {
      yield* catalog.setDataDir(activeDataDir);
      return yield* effect;
    }),
  );
}

function mapBundlesError(error: unknown): never {
  if (error instanceof BundlesError) {
    throw new PushError(error.code, error.message, error.status);
  }
  if (error instanceof StorageError) {
    throw new PushError(error.code, error.message, error.status);
  }
  if (error instanceof CatalogError) {
    throw new PushError("internal_error", error.message, 500);
  }
  throw error;
}

export function runBundlesSync<A, E, R extends BundleRequirements>(
  effect: Effect.Effect<A, E, R>,
): A {
  try {
    return runtime.runSync(bundleEffect(effect));
  } catch (error) {
    return mapBundlesError(error);
  }
}

export function runBundlesPromise<A, E, R extends BundleRequirements>(
  effect: Effect.Effect<A, E, R>,
): Promise<A> {
  return runtime.runPromise(bundleEffect(effect)).catch(mapBundlesError);
}

export function runBundlesPureSync<A, E>(effect: Effect.Effect<A, E>): A {
  try {
    return runtime.runSync(effect);
  } catch (error) {
    return mapBundlesError(error);
  }
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
