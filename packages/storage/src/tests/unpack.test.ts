import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Stream } from "effect";
import { ArchiveCodec, Storage, StorageError } from "../index";

const page = new TextEncoder().encode("<h1>hi</h1>");
const expandedZipEntry = new Uint8Array(50_000).fill(48);

const archiveCodec = ArchiveCodec.layer({
  gunzip: (source) => source,
  inflateRaw: () => Stream.make(expandedZipEntry),
  tarEntries: (source) =>
    Stream.unwrap(
      Stream.runFold(
        source,
        () => 0,
        (_marker, chunk) => chunk[0] ?? 0,
      ).pipe(Effect.map((marker) => Stream.fromIterable(tarEntriesFor(marker)))),
    ),
});

const platformLayer = Layer.mergeAll(
  NodeCrypto.layer,
  NodeFileSystem.layer,
  NodePath.layer,
  archiveCodec,
);
const storageLayer = Storage.layer.pipe(Layer.provideMerge(platformLayer));

it.layer(storageLayer)("Storage archive readers", (storageTest) => {
  storageTest.effect("keeps a normal path and drops the ./ prefix", () =>
    Effect.gen(function* () {
      const storage = yield* Storage;

      expect(yield* storage.safeEntryPath("./assets/chart.js")).toBe("assets/chart.js");
    }),
  );

  storageTest.effect("refuses climbing, absolute paths and NUL bytes", () =>
    Effect.gen(function* () {
      const storage = yield* Storage;
      const inputs = ["../escape.html", "a/../../escape.html", "/etc/passwd", "bad\0name"];

      for (const input of inputs) {
        const error = yield* Effect.flip(storage.safeEntryPath(input));
        expect(error).toBeInstanceOf(StorageError);
      }
    }),
  );

  storageTest.effect("stops a body larger than the compressed limit", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const storage = yield* Storage;
      const destDir = path.join(
        yield* fs.makeTempDirectoryScoped({ prefix: "hosti-unpack-" }),
        "r1",
      );
      const error = yield* Effect.flip(
        storage.unpackTarball({
          source: Stream.make(new Uint8Array(9)),
          destDir,
          limits: { maxCompressedBytes: 8 },
        }),
      );

      expect(error).toMatchObject({ code: "push_too_large", status: 413 });
    }),
  );

  storageTest.effect("stops a tarball with too many files", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const storage = yield* Storage;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-unpack-" });
      const error = yield* Effect.flip(
        storage.unpackTarball({
          source: Stream.make(new Uint8Array([2])),
          destDir: path.join(tempDir, "r1"),
          limits: { maxFiles: 2 },
        }),
      );

      expect(error).toMatchObject({ code: "too_many_files" });
    }),
  );

  storageTest.effect("drops macOS AppleDouble sidecars", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const storage = yield* Storage;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-unpack-" });
      const destDir = path.join(tempDir, "r1");
      const stats = yield* storage.unpackTarball({
        source: Stream.make(new Uint8Array([3])),
        destDir,
      });

      expect(stats.fileCount).toBe(1);
      expect(yield* fs.readDirectory(destDir)).toEqual(["note.html"]);
    }),
  );

  storageTest.effect("accepts a tarball inside the limits", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const storage = yield* Storage;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-unpack-" });
      const destDir = path.join(tempDir, "r1");
      const stats = yield* storage.unpackTarball({
        source: Stream.make(new Uint8Array([4])),
        destDir,
      });

      expect(stats).toEqual({ fileCount: 1, byteSize: page.length });
      expect(yield* fs.readFileString(path.join(destDir, "index.html"))).toBe("<h1>hi</h1>");
    }),
  );

  storageTest.effect("cuts off a deflated file that inflates past the limit", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const storage = yield* Storage;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-unzip-" });
      const error = yield* Effect.flip(
        storage.unpackZip({
          source: Stream.make(
            makeZip([{ name: "big.bin", content: new Uint8Array([1]), method: 8, size: 10 }]),
          ),
          destDir: path.join(tempDir, "r1"),
          limits: { maxFileBytes: 1000 },
        }),
      );

      expect(error).toMatchObject({ code: "file_too_large" });
    }),
  );

  storageTest.effect("stops a zip body larger than the compressed limit", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const storage = yield* Storage;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-unzip-" });
      const error = yield* Effect.flip(
        storage.unpackZip({
          source: Stream.make(makeZip([{ name: "index.html", content: new Uint8Array(4096) }])),
          destDir: path.join(tempDir, "r1"),
          limits: { maxCompressedBytes: 8 },
        }),
      );

      expect(error).toMatchObject({ code: "push_too_large", status: 413 });
    }),
  );

  storageTest.effect("drops the Finder's __MACOSX tree and its sidecars", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const storage = yield* Storage;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-unzip-" });
      const destDir = path.join(tempDir, "r1");
      const zip = makeZip([
        { name: "__MACOSX/", content: new Uint8Array(0) },
        { name: "__MACOSX/._index.html", content: new TextEncoder().encode("junk") },
        { name: "index.html", content: page },
      ]);
      const stats = yield* storage.unpackZip({
        source: Stream.make(zip),
        destDir,
      });

      expect(stats.fileCount).toBe(1);
      expect(yield* fs.readDirectory(destDir)).toEqual(["index.html"]);
    }),
  );

  storageTest.effect("says so when the bytes hold no zip directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const storage = yield* Storage;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-unzip-" });
      const error = yield* Effect.flip(
        storage.unpackZip({
          source: Stream.make(new Uint8Array(200)),
          destDir: path.join(tempDir, "r1"),
        }),
      );

      expect(error).toMatchObject({ code: "bad_zip" });
    }),
  );
});

function tarEntriesFor(marker: number) {
  if (marker === 2) {
    return [
      { path: "index.html", kind: "file" as const, size: page.length, content: Stream.make(page) },
      { path: "a.txt", kind: "file" as const, size: 1, content: Stream.make(new Uint8Array([97])) },
      { path: "b.txt", kind: "file" as const, size: 1, content: Stream.make(new Uint8Array([98])) },
    ];
  }
  if (marker === 3) {
    return [
      {
        path: "._note.html",
        kind: "file" as const,
        size: 4,
        content: Stream.make(new TextEncoder().encode("junk")),
      },
      { path: "note.html", kind: "file" as const, size: page.length, content: Stream.make(page) },
    ];
  }
  return [
    { path: "index.html", kind: "file" as const, size: page.length, content: Stream.make(page) },
  ];
}

function makeZip(
  entries: Array<{ name: string; content: Uint8Array; method?: number; size?: number }>,
) {
  const locals: Uint8Array[] = [];
  const centralEntries: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const method = entry.method ?? 0;
    const uncompressedSize = entry.size ?? entry.content.length;
    const local = new Uint8Array(30 + nameBytes.length + entry.content.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, method, true);
    localView.setUint32(18, entry.content.length, true);
    localView.setUint32(22, uncompressedSize, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(entry.content, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 0x031e, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(20, entry.content.length, true);
    centralView.setUint32(24, uncompressedSize, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);

    locals.push(local);
    centralEntries.push(central);
    localOffset += local.length;
  }

  const localData = joinBytes(locals);
  const centralData = joinBytes(centralEntries);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralData.length, true);
  endView.setUint32(16, localData.length, true);
  return joinBytes([localData, centralData, end]);
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
