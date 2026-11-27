import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";
import { WRITER_LEASE_FILE } from "../index";
import {
  createBundle,
  createVersion3Database,
  rejection,
  slugs,
  withVolume,
} from "./writer.test-support";

describe("single writer per data volume", () => {
  it.effect("opens an older database read-only without migrating or writing it", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const databaseFile = path.join(volume.dataDir, "hosti.db");
        yield* Effect.sync(() => createVersion3Database(databaseFile));
        const before = yield* fs.readFile(databaseFile);
        volume.files.set(
          volume.dataDir,
          JSON.stringify({ version: 1, owner: "old-attempt", fence: null, spent: [] }),
        );

        const reader = yield* volume.start("candidate-attempt");
        expect(yield* reader.catalog.writerStatus).toEqual({
          ready: true,
          writer: false,
          schema: "3",
          epoch: "candidate-attempt",
        });
        expect(yield* slugs(reader.catalog)).toEqual(["legacy"]);
        expect(yield* rejection(reader.catalog.admitWriter)).toContain("WriterUnavailable");
        yield* reader.stop;

        expect(Buffer.from(yield* fs.readFile(databaseFile)).equals(Buffer.from(before))).toBe(
          true,
        );
        expect(yield* fs.exists(path.join(volume.dataDir, WRITER_LEASE_FILE))).toBe(false);
      }),
    ),
  );

  it.effect("keeps a read-only reader serving through the writer's migration", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        yield* Effect.sync(() => createVersion3Database(path.join(volume.dataDir, "hosti.db")));
        volume.files.set(
          volume.dataDir,
          JSON.stringify({ version: 1, owner: null, fence: "attempt-1", spent: [] }),
        );
        const old = yield* volume.start("attempt-0");
        expect(yield* old.catalog.writerStatus).toMatchObject({ writer: false, schema: "3" });
        expect(yield* slugs(old.catalog)).toEqual(["legacy"]);

        const candidate = yield* volume.start("attempt-1");
        expect(yield* candidate.catalog.writerStatus).toMatchObject({ writer: true, schema: "4" });
        yield* createBundle(candidate.catalog, "after-migration");
        expect(yield* old.catalog.writerStatus).toMatchObject({ writer: false, schema: "4" });
        expect(yield* slugs(old.catalog)).toEqual(["after-migration", "legacy"]);
        yield* candidate.stop;
        yield* old.stop;
      }),
    ),
  );

  it.effect("lets only the lease holder write and promotes a waiting reader after release", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const first = yield* volume.start();
        yield* createBundle(first.catalog, "from-first");
        const second = yield* volume.start();
        expect((yield* second.catalog.writerStatus).writer).toBe(false);
        expect(yield* rejection(second.catalog.admitWriter)).toContain("WriterUnavailable");
        expect(yield* slugs(second.catalog)).toEqual(["from-first"]);

        yield* first.stop;
        expect((yield* second.catalog.writerStatus).writer).toBe(true);
        yield* createBundle(second.catalog, "from-second");
        expect(yield* slugs(second.catalog)).toEqual(["from-first", "from-second"]);
        yield* second.stop;
      }),
    ),
  );

  it.effect("fails closed on unreadable writer state", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const seed = yield* volume.start();
        yield* createBundle(seed.catalog, "kept");
        yield* seed.stop;
        volume.files.set(volume.dataDir, "{not json");

        const instance = yield* volume.start();
        expect(yield* instance.catalog.writerStatus).toMatchObject({ ready: false, writer: false });
        expect(yield* slugs(instance.catalog)).toEqual(["kept"]);
        expect(yield* rejection(instance.catalog.fenceOn("attempt-1"))).toBe("state_invalid");
        expect(yield* rejection(instance.catalog.fenceOff("attempt-1"))).toBe("state_invalid");
        yield* instance.stop;
      }),
    ),
  );

  it.effect("observes a cold volume for smoke without creating, migrating or claiming it", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const databaseFile = path.join(volume.dataDir, "hosti.db");

        const empty = yield* volume.start();
        expect(yield* empty.catalog.observeWriter).toEqual({
          ready: false,
          writer: false,
          schema: "4",
          epoch: null,
          bundles: 0,
        });
        yield* empty.stop;
        expect(yield* fs.readDirectory(volume.dataDir)).toEqual([]);
        expect(volume.files.size).toBe(0);

        yield* Effect.sync(() => createVersion3Database(databaseFile));
        const before = yield* fs.readFile(databaseFile);
        const cold = yield* volume.start();
        expect(yield* cold.catalog.observeWriter).toEqual({
          ready: true,
          writer: false,
          schema: "3",
          epoch: null,
          bundles: 1,
        });
        expect(yield* cold.catalog.observeWriter).toMatchObject({ writer: false, schema: "3" });
        expect(yield* fs.readDirectory(volume.dataDir)).toEqual(["hosti.db"]);
        expect(Buffer.from(yield* fs.readFile(databaseFile)).equals(Buffer.from(before))).toBe(
          true,
        );
        expect(volume.files.size).toBe(0);

        expect(yield* cold.catalog.writerStatus).toMatchObject({ writer: true, schema: "4" });
        yield* cold.stop;
      }),
    ),
  );
});
