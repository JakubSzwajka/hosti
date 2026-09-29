import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, it } from "@effect/vitest";
import Database from "better-sqlite3";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Catalog, catalogSchemaSql } from "../index";

const platformLayer = Layer.mergeAll(NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer);
type TestServices = Catalog | FileSystem.FileSystem | Path.Path | import("effect/Crypto").Crypto;

function withTemporaryCatalog<A, E>(test: (dataDir: string) => Effect.Effect<A, E, TestServices>) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dataDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-catalog-" });
    const schemaFile = path.resolve(import.meta.dirname, "../../schema.sql");
    const schemaSql = yield* fs.readFileString(schemaFile);
    expect(schemaSql).toBe(catalogSchemaSql);
    const catalogLayer = Catalog.layer(dataDir, schemaSql).pipe(Layer.provideMerge(platformLayer));
    return yield* test(dataDir).pipe(Effect.provide(catalogLayer));
  }).pipe(Effect.provide(platformLayer));
}

it.effect("opens a version 2 database and migrates it to version 4", () =>
  withTemporaryCatalog((dataDir) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const databaseFile = path.join(dataDir, "hosti.db");

      yield* Effect.sync(() => {
        const database = new Database(databaseFile);
        database.exec(`
          CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          INSERT INTO meta (key, value) VALUES ('schema_version', '2');
          CREATE TABLE bundles (
            id INTEGER PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            collection TEXT,
            current_revision_id INTEGER,
            share_mode TEXT NOT NULL DEFAULT 'private',
            share_slug TEXT NOT NULL DEFAULT '',
            pin_hash TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE revisions (
            id INTEGER PRIMARY KEY,
            bundle_id INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            byte_size INTEGER NOT NULL,
            file_count INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE (bundle_id, seq)
          );
          INSERT INTO bundles (id, slug, title, collection, share_slug, created_at, updated_at)
            VALUES (1, 'legacy-bundle', 'Legacy', '-', 'legacy-bundle', 'now', 'now');
        `);
        database.close();
      });

      const catalog = yield* Catalog;
      const database = yield* catalog.database;
      const version = yield* Effect.sync(
        () =>
          database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as {
            value: string;
          },
      );
      const revisionColumns = yield* Effect.sync(
        () => database.prepare("PRAGMA table_info(revisions)").all() as { name: string }[],
      );
      const collection = yield* Effect.sync(
        () =>
          database.prepare("SELECT collection FROM bundles WHERE id = 1").get() as {
            collection: string | null;
          },
      );

      expect(version.value).toBe("4");
      expect(revisionColumns.map((column) => column.name)).toContain("pushed_by");
      expect(collection.collection).toBeNull();
    }),
  ),
);

it.effect("round-trips a bundle and revision through the catalog", () =>
  withTemporaryCatalog(() =>
    Effect.gen(function* () {
      const catalog = yield* Catalog;
      const bundle = yield* catalog.createBundle({
        slug: "round-trip",
        title: " Round trip ",
        collection: "reports",
      });
      const revision = yield* catalog.recordRevision({
        bundleId: bundle.id,
        seq: yield* catalog.nextRevisionSeq(bundle.id),
        byteSize: 128,
        fileCount: 2,
        pushedBy: "@catalog",
      });
      const found = yield* catalog.findBundle("round-trip");
      const revisions = yield* catalog.listRevisions(bundle.id);
      const collections = yield* catalog.listCollections;

      expect(found?.title).toBe("Round trip");
      expect(revision).toMatchObject({ seq: 1, byteSize: 128, fileCount: 2, pushedBy: "@catalog" });
      expect(revisions).toMatchObject([{ seq: 1, current: true }]);
      expect(collections).toEqual(["reports"]);
    }),
  ),
);

it.effect("returns a typed CatalogError for a duplicate bundle", () =>
  withTemporaryCatalog(() =>
    Effect.gen(function* () {
      const catalog = yield* Catalog;
      yield* catalog.createBundle({ slug: "same-slug" });
      const error = yield* Effect.flip(catalog.createBundle({ slug: "same-slug" }));

      expect(error._tag).toBe("CatalogError");
      expect(error.operation).toBe("createBundle");
      expect(error.message).toMatch(/UNIQUE/);
    }),
  ),
);
