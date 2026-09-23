import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { Catalog, openDatabaseAt } from "@hosti/catalog";
import { Storage } from "@hosti/storage";
import type Database from "better-sqlite3";
import { Effect, Layer, ManagedRuntime } from "effect";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "@/server/config";
import { NodeArchiveCodec } from "@/server/storage/node-archive-codec";

const catalogSchemaFile = path.resolve(process.cwd(), "../../packages/catalog/schema.sql");
const catalogSchemaSql = readFileSync(catalogSchemaFile, "utf8");

const platformLayer = Layer.mergeAll(
  NodeCrypto.layer,
  NodeFileSystem.layer,
  NodePath.layer,
  NodeArchiveCodec.layer,
);
const runtimeLayer = Layer.mergeAll(Catalog.layer(dataDir(), catalogSchemaSql), Storage.layer).pipe(
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
