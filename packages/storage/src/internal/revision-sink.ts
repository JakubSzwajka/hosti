import { PUSH_LIMITS } from "@hosti/shared";
import { Effect, type FileSystem, type Path, Ref, Stream } from "effect";
import { type StorageError, storageError } from "../storage-error";
import type { StorageSink, UnpackLimits, UnpackStats } from "../types";
import { isMacNoise, safeEntryPath } from "./entry-path";

export function makeRevisionSink(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  destDir: string,
  overrides: Partial<UnpackLimits> = {},
): StorageSink {
  const limits = { ...PUSH_LIMITS, ...overrides };
  const stats: UnpackStats = { fileCount: 0, byteSize: 0 };

  const directory = Effect.fnUntraced(function* (rawPath: string) {
    const relative = yield* safeEntryPath(rawPath);
    if (!relative || isMacNoise(relative, path)) return;
    yield* fs
      .makeDirectory(path.join(destDir, relative), { recursive: true })
      .pipe(Effect.mapError((cause) => storageError("storage_io", String(cause), 500)));
  });

  const file = Effect.fnUntraced(function* (
    rawPath: string,
    declaredSize: number,
    content: Stream.Stream<Uint8Array, StorageError>,
  ) {
    const relative = yield* safeEntryPath(rawPath);
    if (!relative) {
      return yield* storageError("unsafe_path", `Entry ${rawPath} has no name`);
    }
    if (isMacNoise(relative, path)) return null;

    stats.fileCount += 1;
    if (stats.fileCount > limits.maxFiles) {
      return yield* storageError(
        "too_many_files",
        `A bundle may hold at most ${limits.maxFiles} files`,
      );
    }
    if (declaredSize > limits.maxFileBytes) {
      return yield* tooLarge(relative, limits.maxFileBytes);
    }

    const target = path.join(destDir, relative);
    yield* fs
      .makeDirectory(path.dirname(target), { recursive: true })
      .pipe(Effect.mapError((cause) => storageError("storage_io", String(cause), 500)));

    const bytesWritten = yield* Effect.gen(function* () {
      const byteCount = yield* Ref.make(0);
      const checked = content.pipe(
        Stream.mapEffect((chunk) =>
          Effect.gen(function* () {
            const total = yield* Ref.updateAndGet(byteCount, (current) => current + chunk.length);
            if (total > limits.maxFileBytes) {
              return yield* tooLarge(relative, limits.maxFileBytes);
            }
            return chunk;
          }),
        ),
      );
      yield* Stream.run(checked, fs.sink(target)).pipe(
        Effect.mapError((cause) =>
          cause._tag === "StorageError" ? cause : storageError("storage_io", String(cause), 500),
        ),
      );
      return yield* Ref.get(byteCount);
    });
    stats.byteSize += bytesWritten;
    return undefined;
  });

  const refuse = (rawPath: string, typeName: string) =>
    Effect.fail(
      storageError("unsafe_entry", `Entry ${rawPath} is a ${typeName}, which Hosti refuses`),
    );

  const finish = () =>
    stats.fileCount === 0
      ? Effect.fail(storageError("empty_push", "The pushed archive holds no files"))
      : Effect.succeed(stats);

  return {
    stats,
    maxCompressedBytes: limits.maxCompressedBytes,
    maxFileBytes: limits.maxFileBytes,
    directory,
    file,
    refuse,
    finish,
  };
}

function tooLarge(relative: string, maxFileBytes: number): StorageError {
  return storageError("file_too_large", `${relative} is larger than ${maxFileBytes} bytes`);
}
