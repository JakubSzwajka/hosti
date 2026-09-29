import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Stream } from "effect";
import { ArchiveCodec, Storage, StorageError } from "../index";

const successContent = new Uint8Array([60, 104, 49, 62, 104, 105, 60, 47, 104, 49, 62]);

const fakeArchiveCodec = ArchiveCodec.layer({
  gunzip: (source) => source,
  inflateRaw: (source) => source,
  tarEntries: (source) =>
    Stream.unwrap(
      Stream.runFold(
        source,
        () => 0,
        (_marker, chunk) => chunk[0] ?? 0,
      ).pipe(Effect.map((marker) => Stream.fromIterable(entriesFor(marker)))),
    ),
});

const platformLayer = Layer.mergeAll(
  NodeCrypto.layer,
  NodeFileSystem.layer,
  NodePath.layer,
  fakeArchiveCodec,
);
const storageLayer = Storage.layer.pipe(Layer.provideMerge(platformLayer));

it.layer(storageLayer)("Storage", (storageTest) => {
  storageTest.effect("unpacks a bundle into a revision and moves current", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const storage = yield* Storage;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-storage-" });
      const bundlesRoot = path.join(tempDir, "bundles");
      const stats = yield* storage.writeRevision({
        bundlesRoot,
        bundleSlug: "demo",
        seq: 1,
        source: Stream.make(new Uint8Array([1])),
        format: "tar.gz",
      });
      const currentRoot = yield* storage.currentRevisionRoot(bundlesRoot, "demo");
      assert.isNotNull(currentRoot);
      const content = yield* fs.readFileString(path.join(currentRoot, "index.html"));

      expect(stats).toEqual({ fileCount: 1, byteSize: successContent.length });
      expect(content).toBe("<h1>hi</h1>");
    }),
  );

  storageTest.effect("rejects a path traversal as a typed storage error", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const storage = yield* Storage;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-storage-" });
      const error = yield* Effect.flip(
        storage.writeRevision({
          bundlesRoot: path.join(tempDir, "bundles"),
          bundleSlug: "demo",
          seq: 1,
          source: Stream.make(new Uint8Array([2])),
        }),
      );

      expect(error).toBeInstanceOf(StorageError);
      expect(error._tag).toBe("StorageError");
      expect(error.code).toBe("unsafe_path");
      expect(yield* fs.exists(path.join(tempDir, "escape.html"))).toBe(false);
    }),
  );

  storageTest.effect("rejects an archive that exceeds the file-count limit", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const storage = yield* Storage;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-storage-" });
      const error = yield* Effect.flip(
        storage.unpackTarball({
          source: Stream.make(new Uint8Array([3])),
          destDir: path.join(tempDir, "r1"),
          limits: { maxFiles: 1 },
        }),
      );

      expect(error._tag).toBe("StorageError");
      expect(error.code).toBe("too_many_files");
    }),
  );
});

function entriesFor(marker: number) {
  if (marker === 2) {
    return [
      {
        path: "../escape.html",
        kind: "file" as const,
        size: successContent.length,
        content: Stream.make(successContent),
      },
    ];
  }
  if (marker === 3) {
    return [
      {
        path: "index.html",
        kind: "file" as const,
        size: successContent.length,
        content: Stream.make(successContent),
      },
      {
        path: "extra.html",
        kind: "file" as const,
        size: 1,
        content: Stream.make(new Uint8Array([120])),
      },
    ];
  }
  return [
    {
      path: "index.html",
      kind: "file" as const,
      size: successContent.length,
      content: Stream.make(successContent),
    },
  ];
}
