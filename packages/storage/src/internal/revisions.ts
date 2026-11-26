import { ENTRY_FILE } from "@hosti/shared";
import { Effect, type FileSystem, type Path } from "effect";
import type { Crypto } from "effect/Crypto";
import type { ArchiveCodec } from "../archive-codec";
import { storageError, type StorageError } from "../storage-error";
import type { ArchiveFormat, UnpackLimits, UnpackStats } from "../types";
import { unpackTarball } from "./unpack";
import { currentLink, revisionDir, bundleDir } from "./paths";
import { unpackZip } from "./unzip";

export const ensureEntryFile = Effect.fnUntraced(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
): Effect.fn.Return<void, StorageError> {
  const names = yield* fs
    .readDirectory(dir)
    .pipe(Effect.mapError((cause) => storageError("storage_io", String(cause), 500)));
  const entries = yield* Effect.forEach(names, (name) =>
    fs.stat(path.join(dir, name)).pipe(
      Effect.map((info) => ({
        name,
        isFile: info.type === "File",
        isDirectory: info.type === "Directory",
      })),
      Effect.mapError((cause) => storageError("storage_io", String(cause), 500)),
    ),
  );
  const files = entries.filter((entry) => entry.isFile);
  if (files.some((file) => file.name === ENTRY_FILE)) return;

  const htmlFiles = files.filter((file) => file.name.toLowerCase().endsWith(".html"));
  const only = htmlFiles[0];
  if (htmlFiles.length === 1 && only) {
    yield* fs
      .rename(path.join(dir, only.name), path.join(dir, ENTRY_FILE))
      .pipe(Effect.mapError((cause) => storageError("storage_io", String(cause), 500)));
    return;
  }

  const found = entries.map((entry) => (entry.isDirectory ? `${entry.name}/` : entry.name));
  const listed = found.length ? found.slice(0, 20).join(", ") : "nothing";
  return yield* storageError(
    "no_entry_file",
    htmlFiles.length > 1
      ? `No ${ENTRY_FILE} at the root and ${htmlFiles.length} HTML files to choose from: ${listed}`
      : `No ${ENTRY_FILE} at the root of the pushed tree. Found: ${listed}`,
  );
});

export const writeRevision = Effect.fnUntraced(function* (
  dependencies: {
    readonly archiveCodec: ArchiveCodec["Service"];
    readonly fileSystem: FileSystem.FileSystem;
    readonly path: Path.Path;
    readonly crypto: Crypto;
  },
  input: {
    readonly bundlesRoot: string;
    readonly bundleSlug: string;
    readonly seq: number;
    readonly source: import("effect").Stream.Stream<Uint8Array, StorageError>;
    readonly format?: ArchiveFormat;
    readonly limits?: Partial<UnpackLimits>;
  },
): Effect.fn.Return<UnpackStats, StorageError> {
  const { archiveCodec, fileSystem: fs, path, crypto } = dependencies;
  const dir = revisionDir(path, input.bundlesRoot, input.bundleSlug, input.seq);
  yield* fs
    .remove(dir, { recursive: true, force: true })
    .pipe(Effect.mapError((cause) => storageError("storage_io", String(cause), 500)));

  const unpack = input.format === "zip" ? unpackZip : unpackTarball;
  const operation = Effect.gen(function* () {
    const stats = yield* unpack(archiveCodec, fs, path, input.source, dir, input.limits);
    yield* ensureEntryFile(fs, path, dir);
    yield* flipCurrent(fs, path, crypto, input.bundlesRoot, input.bundleSlug, input.seq);
    return stats;
  });
  return yield* operation.pipe(
    Effect.tapError(() =>
      fs.remove(dir, { recursive: true, force: true }).pipe(
        Effect.mapError((cause) => storageError("storage_io", String(cause), 500)),
        Effect.ignore,
      ),
    ),
  );
});

function flipCurrent(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  crypto: Crypto,
  bundlesRoot: string,
  bundleSlug: string,
  seq: number,
) {
  return Effect.gen(function* () {
    const link = currentLink(path, bundlesRoot, bundleSlug);
    const stagingName = `.current-${yield* crypto.randomUUIDv4.pipe(
      Effect.mapError((cause) => storageError("storage_io", String(cause), 500)),
    )}`;
    const staging = path.join(bundleDir(path, bundlesRoot, bundleSlug), stagingName);
    yield* fs
      .symlink(`r${seq}`, staging)
      .pipe(Effect.mapError((cause) => storageError("storage_io", String(cause), 500)));
    yield* fs.rename(staging, link).pipe(
      Effect.mapError((cause) => storageError("storage_io", String(cause), 500)),
      Effect.tapError(() =>
        fs.remove(staging, { force: true }).pipe(
          Effect.mapError((cause) => storageError("storage_io", String(cause), 500)),
          Effect.ignore,
        ),
      ),
    );
  });
}
