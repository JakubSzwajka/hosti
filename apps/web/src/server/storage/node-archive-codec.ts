import { NodeStream } from "@effect/platform-node";
import { Effect, Layer, Stream } from "effect";
import { createGunzip, createInflateRaw } from "node:zlib";
import { Readable } from "node:stream";
import { Parser, type ReadEntry } from "tar";
import { ArchiveCodec, StorageError } from "@hosti/storage";
import type { ArchiveEntry } from "@hosti/storage";

const FILE_TYPES = new Set(["File", "OldFile", "ContiguousFile"]);
const DIRECTORY_TYPES = new Set(["Directory", "GNUDumpDir"]);

export const NodeArchiveCodec = {
  layer: Layer.succeed(ArchiveCodec)({
    gunzip: (source) =>
      NodeStream.pipeThroughDuplex(source, {
        evaluate: createGunzip,
        onError: (cause) => toStorageError("bad_tarball", "Cannot read the pushed tarball", cause),
      }),
    inflateRaw: (source) =>
      NodeStream.pipeThroughDuplex(source, {
        evaluate: createInflateRaw,
        onError: (cause) => toStorageError("bad_zip", "Cannot inflate a zip entry", cause),
      }),
    tarEntries: (source) =>
      Stream.unwrap(
        Effect.map(NodeStream.toReadable(source), (readable) =>
          Stream.fromAsyncIterable(readTarEntries(readable), (cause) =>
            toStorageError("bad_tarball", "Cannot read the pushed tarball", cause),
          ),
        ),
      ),
  }),
};

function readTarEntries(readable: Readable): AsyncGenerator<ArchiveEntry> {
  return (async function* () {
    const parser = new Parser();
    const pending: ReadEntry[] = [];
    let ended = false;
    let failure: unknown;
    let resume: (() => void) | undefined;
    const wake = () => {
      const continueReading = resume;
      resume = undefined;
      continueReading?.();
    };

    parser.on("entry", (entry: ReadEntry) => {
      pending.push(entry);
      wake();
    });
    parser.on("error", (cause: unknown) => {
      failure = cause;
      ended = true;
      wake();
    });
    parser.on("end", () => {
      ended = true;
      wake();
    });
    readable.on("error", (cause: unknown) => {
      failure = cause;
      ended = true;
      parser.abort(cause instanceof Error ? cause : new Error(String(cause)));
      wake();
    });
    readable.pipe(parser);

    try {
      while (true) {
        const entry = pending.shift();
        if (entry !== undefined) {
          yield archiveEntry(entry);
          continue;
        }
        if (failure !== undefined) throw failure;
        if (ended) return;
        await new Promise<void>((resolve) => {
          resume = resolve;
        });
      }
    } finally {
      readable.unpipe(parser);
      if (!readable.destroyed) readable.destroy();
    }
  })();
}

function archiveEntry(entry: ReadEntry): ArchiveEntry {
  const kind = DIRECTORY_TYPES.has(String(entry.type))
    ? "directory"
    : FILE_TYPES.has(String(entry.type))
      ? "file"
      : "other";
  return {
    path: entry.path,
    kind,
    size: entry.size ?? 0,
    content: NodeStream.fromReadable({
      evaluate: () => Readable.from(entry, { objectMode: false }),
      onError: (cause) => toStorageError("bad_tarball", "Cannot read a tar entry", cause),
    }),
  };
}

function toStorageError(code: string, prefix: string, cause: unknown): StorageError {
  if (cause instanceof StorageError) return cause;
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new StorageError({ code, message: `${prefix}: ${detail}`, status: 400 });
}
