import { Effect, type FileSystem, type Path, Stream } from "effect";
import type { ArchiveCodec } from "../archive-codec";
import { storageError, type StorageError } from "../storage-error";
import type { ArchiveEntry, UnpackLimits, UnpackStats } from "../types";
import { limitCompressedBytes } from "./archive-stream";
import { makeRevisionSink } from "./revision-sink";

export const unpackTarball = Effect.fnUntraced(function* (
  codec: ArchiveCodec["Service"],
  fs: FileSystem.FileSystem,
  path: Path.Path,
  source: Stream.Stream<Uint8Array, StorageError>,
  destDir: string,
  overrides: Partial<UnpackLimits> = {},
): Effect.fn.Return<UnpackStats, StorageError> {
  const sink = makeRevisionSink(fs, path, destDir, overrides);
  yield* fs
    .makeDirectory(destDir, { recursive: true })
    .pipe(Effect.mapError((cause) => storageError("storage_io", String(cause), 500)));

  const compressed = limitCompressedBytes(source, sink.maxCompressedBytes);
  const entries = codec.tarEntries(codec.gunzip(compressed));
  yield* Stream.runForEach(entries, (entry: ArchiveEntry) => consumeEntry(sink, entry));
  return yield* sink.finish();
});

function consumeEntry(sink: ReturnType<typeof makeRevisionSink>, entry: ArchiveEntry) {
  if (entry.kind === "directory") {
    return sink.directory(entry.path).pipe(Effect.andThen(Stream.runDrain(entry.content)));
  }
  if (entry.kind !== "file") return sink.refuse(entry.path, entry.kind);
  return sink
    .file(entry.path, entry.size, entry.content)
    .pipe(
      Effect.flatMap((written) =>
        written === null ? Stream.runDrain(entry.content) : Effect.void,
      ),
    );
}
