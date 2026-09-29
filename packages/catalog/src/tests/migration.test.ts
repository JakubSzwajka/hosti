import { expect, it } from "@effect/vitest";
import Database from "better-sqlite3";
import { Effect } from "effect";
import { openDatabaseAt } from "../index";
import {
  NOW,
  seedVersion1,
  seedVersion2,
  tableNames,
  withDatabase,
  withTempDirectory,
} from "./migration.test-support";

it.effect("keeps every bundle, revision and push token", () =>
  withTempDirectory((dataDir, schemaSql) => {
    const file = `${dataDir}/hosti.db`;
    return Effect.gen(function* () {
      yield* Effect.sync(() => seedVersion1(file));
      yield* withDatabase(file, schemaSql, (database) =>
        Effect.gen(function* () {
          const bundles = yield* Effect.sync(() =>
            database.prepare("SELECT COUNT(*) AS n FROM bundles").get(),
          );
          const revisions = yield* Effect.sync(() =>
            database.prepare("SELECT COUNT(*) AS n FROM revisions").get(),
          );
          const tokens = yield* Effect.sync(() =>
            database.prepare("SELECT COUNT(*) AS n FROM push_tokens").get(),
          );
          const bundle = yield* Effect.sync(
            () =>
              database.prepare("SELECT * FROM bundles WHERE slug = 'squad-2026'").get() as Record<
                string,
                unknown
              >,
          );

          expect(bundles).toEqual({ n: 2 });
          expect(revisions).toEqual({ n: 3 });
          expect(tokens).toEqual({ n: 1 });
          expect(bundle.title).toBe("squad-2026");
          expect(bundle.collection).toBe("reports");
          expect(bundle.current_revision_id).toBe(2);
          expect(bundle.created_at).toBe(NOW);
        }),
      );
    });
  }),
);

it.effect("drops share_links and every link in it", () =>
  withTempDirectory((dataDir, schemaSql) => {
    const file = `${dataDir}/hosti.db`;
    return Effect.gen(function* () {
      yield* Effect.sync(() => seedVersion1(file));
      yield* withDatabase(file, schemaSql, (database) =>
        Effect.sync(() =>
          expect(tableNames(database)).toEqual(["bundles", "meta", "push_tokens", "revisions"]),
        ),
      );
    });
  }),
);

it.effect("lands every bundle private, on its own slug, with no pin", () =>
  withTempDirectory((dataDir, schemaSql) => {
    const file = `${dataDir}/hosti.db`;
    return Effect.gen(function* () {
      yield* Effect.sync(() => seedVersion1(file));
      yield* withDatabase(file, schemaSql, (database) =>
        Effect.gen(function* () {
          const rows = yield* Effect.sync(() =>
            database
              .prepare("SELECT slug, share_mode, share_slug, pin_hash FROM bundles ORDER BY slug")
              .all(),
          );
          expect(rows).toEqual([
            { slug: "garmin-q3", share_mode: "private", share_slug: "garmin-q3", pin_hash: null },
            { slug: "squad-2026", share_mode: "private", share_slug: "squad-2026", pin_hash: null },
          ]);
        }),
      );
    });
  }),
);

it.effect("writes the new version and runs only once", () =>
  withTempDirectory((dataDir, schemaSql) => {
    const file = `${dataDir}/hosti.db`;
    return Effect.gen(function* () {
      yield* Effect.sync(() => seedVersion1(file));
      yield* withDatabase(file, schemaSql, (database) =>
        Effect.gen(function* () {
          const version = yield* Effect.sync(() =>
            database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get(),
          );
          expect(version).toEqual({ value: "4" });
          yield* Effect.sync(() =>
            database
              .prepare("UPDATE bundles SET share_mode = 'link' WHERE slug = 'squad-2026'")
              .run(),
          );
        }),
      );
      yield* withDatabase(file, schemaSql, (database) =>
        Effect.gen(function* () {
          const mode = yield* Effect.sync(() =>
            database.prepare("SELECT share_mode FROM bundles WHERE slug = 'squad-2026'").get(),
          );
          expect(mode).toEqual({ share_mode: "link" });
        }),
      );
    });
  }),
);

it.effect("keeps two share slugs from colliding", () =>
  withTempDirectory((dataDir, schemaSql) => {
    const file = `${dataDir}/hosti.db`;
    return Effect.gen(function* () {
      yield* Effect.sync(() => seedVersion1(file));
      yield* withDatabase(file, schemaSql, (database) =>
        Effect.sync(() =>
          expect(() =>
            database
              .prepare("UPDATE bundles SET share_slug = 'garmin-q3' WHERE slug = 'squad-2026'")
              .run(),
          ).toThrow(/UNIQUE/),
        ),
      );
    });
  }),
);

it.effect("keeps every bundle, revision and push token", () =>
  withTempDirectory((dataDir, schemaSql) => {
    const file = `${dataDir}/hosti.db`;
    return Effect.gen(function* () {
      yield* Effect.sync(() => seedVersion2(file));
      yield* withDatabase(file, schemaSql, (database) =>
        Effect.gen(function* () {
          const bundles = yield* Effect.sync(() =>
            database.prepare("SELECT COUNT(*) AS n FROM bundles").get(),
          );
          const revisions = yield* Effect.sync(() =>
            database.prepare("SELECT COUNT(*) AS n FROM revisions").get(),
          );
          const tokens = yield* Effect.sync(() =>
            database.prepare("SELECT COUNT(*) AS n FROM push_tokens").get(),
          );
          const rows = yield* Effect.sync(() =>
            database
              .prepare(
                "SELECT slug, title, collection, share_mode, share_slug FROM bundles ORDER BY id",
              )
              .all(),
          );
          const names = yield* Effect.sync(() =>
            database.prepare("SELECT name FROM push_tokens ORDER BY name").all(),
          );

          expect(bundles).toEqual({ n: 2 });
          expect(revisions).toEqual({ n: 3 });
          expect(tokens).toEqual({ n: 2 });
          expect(rows).toEqual([
            {
              slug: "squad-2026",
              title: "Squad 2026",
              collection: "reports",
              share_mode: "link",
              share_slug: "squad-2026",
            },
            {
              slug: "garmin-q3",
              title: "Garmin Q3",
              collection: null,
              share_mode: "pin",
              share_slug: "kmqbwxz23456",
            },
          ]);
          expect(names).toEqual([{ name: "ci" }, { name: "laptop" }]);
        }),
      );
    });
  }),
);

it.effect("leaves pushed_by NULL on every revision that was already there", () =>
  withTempDirectory((dataDir, schemaSql) => {
    const file = `${dataDir}/hosti.db`;
    return Effect.gen(function* () {
      yield* Effect.sync(() => seedVersion2(file));
      yield* withDatabase(file, schemaSql, (database) =>
        Effect.gen(function* () {
          const revisions = yield* Effect.sync(() =>
            database.prepare("SELECT id, seq, pushed_by FROM revisions ORDER BY id").all(),
          );
          const current = yield* Effect.sync(() =>
            database.prepare("SELECT current_revision_id FROM bundles ORDER BY id").all(),
          );

          expect(revisions).toEqual([
            { id: 1, seq: 1, pushed_by: null },
            { id: 2, seq: 2, pushed_by: null },
            { id: 3, seq: 1, pushed_by: null },
          ]);
          expect(current).toEqual([{ current_revision_id: 2 }, { current_revision_id: 3 }]);
        }),
      );
    });
  }),
);

it.effect("writes the new version and runs only once", () =>
  withTempDirectory((dataDir, schemaSql) => {
    const file = `${dataDir}/hosti.db`;
    return Effect.gen(function* () {
      yield* Effect.sync(() => seedVersion2(file));
      yield* withDatabase(file, schemaSql, (database) =>
        Effect.gen(function* () {
          const version = yield* Effect.sync(() =>
            database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get(),
          );
          expect(version).toEqual({ value: "4" });
          yield* Effect.sync(() =>
            database.prepare("UPDATE revisions SET pushed_by = 'laptop' WHERE id = 1").run(),
          );
        }),
      );
      yield* withDatabase(file, schemaSql, (database) =>
        Effect.gen(function* () {
          const pushedBy = yield* Effect.sync(() =>
            database.prepare("SELECT pushed_by FROM revisions WHERE id = 1").get(),
          );
          expect(pushedBy).toEqual({ pushed_by: "laptop" });
        }),
      );
    });
  }),
);

it.effect("starts at the same version with the same columns", () =>
  withTempDirectory((dataDir, schemaSql) =>
    Effect.gen(function* () {
      const file = `${dataDir}/hosti.db`;
      yield* withDatabase(file, schemaSql, (database) =>
        Effect.gen(function* () {
          const version = yield* Effect.sync(() =>
            database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get(),
          );
          const names = yield* Effect.sync(() => tableNames(database));
          const bundleColumns = yield* Effect.sync(() =>
            (database.prepare("PRAGMA table_info(bundles)").all() as { name: string }[]).map(
              (row) => row.name,
            ),
          );
          const revisionColumns = yield* Effect.sync(() =>
            (database.prepare("PRAGMA table_info(revisions)").all() as { name: string }[]).map(
              (row) => row.name,
            ),
          );

          expect(version).toEqual({ value: "4" });
          expect(names).toEqual(["bundles", "meta", "push_tokens", "revisions"]);
          expect(bundleColumns).toContain("share_mode");
          expect(bundleColumns).toContain("share_slug");
          expect(bundleColumns).toContain("pin_hash");
          expect(revisionColumns).toContain("pushed_by");
        }),
      );
    }),
  ),
);

it.effect("leaves nothing behind when the schema cannot be written", () =>
  withTempDirectory((dataDir, schemaSql) =>
    Effect.gen(function* () {
      const file = `${dataDir}/hosti.db`;
      yield* Effect.sync(() => {
        const seeded = new Database(file);
        seeded.exec("CREATE TABLE revisions (id INTEGER PRIMARY KEY);");
        seeded.close();
      });
      const error = yield* Effect.flip(openDatabaseAt(file, schemaSql));
      const after = yield* Effect.sync(() => new Database(file));
      const names = tableNames(after);
      yield* Effect.sync(() => after.close());

      expect(error).toMatchObject({
        _tag: "CatalogError",
        message: expect.stringMatching(/revisions/),
      });
      expect(names).toEqual(["revisions"]);
    }),
  ),
);
