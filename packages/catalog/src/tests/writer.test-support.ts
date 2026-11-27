import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import Database from "better-sqlite3";
import {
  Context,
  Deferred,
  Effect,
  Exit,
  FileSystem,
  Layer,
  type Path,
  Schema,
  Scope,
} from "effect";
import { Catalog, CatalogError, catalogSchemaSql, FenceRejected, WriterStateStore } from "../index";

const platformLayer = Layer.mergeAll(NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer);

export type Volume = {
  readonly dataDir: string;
  readonly files: Map<string, string>;
  readonly failAfterNextWrite: () => void;
  readonly holdNextWrite: () => Deferred.Deferred<void>;
  readonly start: (
    epoch?: string,
  ) => Effect.Effect<{ catalog: Catalog["Service"]; stop: Effect.Effect<void> }>;
};

export const withVolume = <A, E>(
  test: (volume: Volume) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dataDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-writer-" });
    const files = new Map<string, string>();
    let failAfterWrite = false;
    let heldWrite: Deferred.Deferred<void> | undefined;
    const store = Layer.succeed(
      WriterStateStore,
      WriterStateStore.of({
        read: (dir) => Effect.sync(() => files.get(dir) ?? null),
        write: (dir, contents) =>
          Effect.suspend(() => {
            const gate = heldWrite;
            heldWrite = undefined;
            return gate === undefined ? Effect.void : Deferred.await(gate);
          }).pipe(
            Effect.andThen(() => {
              files.set(dir, contents);
              if (!failAfterWrite) return Effect.void;
              failAfterWrite = false;
              return Effect.fail(
                new CatalogError({ operation: "syncWriterState", message: "fsync failed" }),
              );
            }),
          ),
      }),
    );
    const start = (epoch?: string) =>
      Effect.gen(function* () {
        const scope = yield* Scope.make();
        const context = yield* Layer.buildWithScope(
          Catalog.layer(dataDir, catalogSchemaSql, { writerEpoch: () => epoch }).pipe(
            Layer.provide(Layer.merge(store, platformLayer)),
          ),
          scope,
        );
        return { catalog: Context.get(context, Catalog), stop: Scope.close(scope, Exit.void) };
      });
    const failAfterNextWrite = () => {
      failAfterWrite = true;
    };
    const holdNextWrite = () => {
      heldWrite = Deferred.makeUnsafe<void>();
      return heldWrite;
    };
    return yield* test({ dataDir, files, failAfterNextWrite, holdNextWrite, start });
  }).pipe(Effect.scoped, Effect.provide(platformLayer));

export const state = (volume: Volume) => JSON.parse(volume.files.get(volume.dataDir) ?? "null");

export const isFenceRejected = Schema.is(FenceRejected);

export const rejection = <A, E extends object>(effect: Effect.Effect<A, E>) =>
  Effect.flip(effect).pipe(
    Effect.map((error) => (isFenceRejected(error) ? error.code : String(error))),
  );

export const createBundle = (catalog: Catalog["Service"], slug: string) =>
  Effect.gen(function* () {
    const permit = yield* catalog.admitWriter;
    yield* catalog.createBundle({ slug });
    yield* catalog.releaseWriter(permit);
  });

export const slugs = (catalog: Catalog["Service"]) =>
  catalog.listCatalog.pipe(Effect.map((bundles) => bundles.map((bundle) => bundle.slug).sort()));

export function createVersion3Database(databaseFile: string): void {
  const database = new Database(databaseFile);
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_version', '3');
    CREATE TABLE bundles (
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      collection TEXT, current_revision_id INTEGER,
      share_mode TEXT NOT NULL DEFAULT 'private', share_slug TEXT NOT NULL DEFAULT '',
      pin_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE revisions (
      id INTEGER PRIMARY KEY, bundle_id INTEGER NOT NULL, seq INTEGER NOT NULL,
      byte_size INTEGER NOT NULL, file_count INTEGER NOT NULL, pushed_by TEXT,
      created_at TEXT NOT NULL, UNIQUE (bundle_id, seq)
    );
    CREATE TABLE push_tokens (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL, last_used_at TEXT
    );
    INSERT INTO bundles (slug, title, collection, share_slug, created_at, updated_at)
      VALUES ('legacy', 'Legacy', '-', 'legacy', 'now', 'now');
  `);
  database.close();
}
