import fs from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { createGunzip } from "node:zlib";
import { Parser, type ReadEntry } from "tar";
import { PushError } from "@/server/errors";
import { RevisionSink, type UnpackLimits, type UnpackStats } from "@/server/storage/revision-sink";

export type { UnpackLimits, UnpackStats };

const FILE_TYPES = new Set(["File", "OldFile", "ContiguousFile"]);
const DIRECTORY_TYPES = new Set(["Directory", "GNUDumpDir"]);

export function countingStream(maxBytes: number): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(
          new PushError(
            "push_too_large",
            `Push body is larger than ${maxBytes} bytes compressed`,
            413,
          ),
        );
        return;
      }
      callback(null, chunk);
    },
  });
}

export async function unpackTarball(
  source: Readable,
  destDir: string,
  overrides: Partial<UnpackLimits> = {},
): Promise<UnpackStats> {
  const sink = new RevisionSink(destDir, overrides);
  await fs.mkdir(destDir, { recursive: true });

  const writes: Promise<void>[] = [];
  const parser = new Parser();
  let failure: Error | null = null;

  const fail = (error: Error) => {
    failure ??= error;
  };

  parser.on("entry", (entry: ReadEntry) => {
    if (failure) {
      entry.resume();
      return;
    }
    try {
      const write = takeEntry(entry, sink);
      if (write) writes.push(write);
      else entry.resume();
    } catch (error) {
      fail(error as Error);
      entry.resume();
    }
  });

  const counter = countingStream(sink.maxCompressedBytes);
  const gunzip = createGunzip();
  source.on("error", (error) => counter.destroy(error));
  counter.on("error", (error) => gunzip.destroy(error));
  source.pipe(counter).pipe(gunzip);

  try {
    for await (const chunk of gunzip) {
      if (failure) break;
      if (!parser.write(chunk as Buffer)) {
        await new Promise<void>((resolve) => parser.once("drain", resolve));
      }
    }
    if (!failure) parser.end();
  } catch (error) {
    fail(normalizeStreamError(error));
  }

  const settled = await Promise.allSettled(writes);
  for (const result of settled) {
    if (result.status === "rejected") fail(result.reason as Error);
  }
  if (failure) throw failure;
  return sink.finish();
}

export function normalizeStreamError(error: unknown): Error {
  if (error instanceof PushError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new PushError("bad_tarball", `Cannot read the pushed tarball: ${message}`);
}

function takeEntry(entry: ReadEntry, sink: RevisionSink): Promise<void> | null {
  const type = String(entry.type);
  if (DIRECTORY_TYPES.has(type)) {
    sink.directory(entry.path);
    return null;
  }
  if (!FILE_TYPES.has(type)) sink.refuse(entry.path, type);
  // Tar exposes a minipass stream; wrap it instead of casting to Node's stream type.
  return sink.file(entry.path, entry.size ?? 0, () => Readable.from(entry, { objectMode: false }));
}
