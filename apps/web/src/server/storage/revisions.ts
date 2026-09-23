import { Effect } from "effect";
import type { Readable } from "node:stream";
import type { ArchiveFormat, UnpackStats } from "@hosti/storage";
import { bundlesDir } from "@/server/config";
import { runStoragePromise } from "@/server/runtime";
import { effectReadable, toPushError } from "@/server/storage/compat";

export type { ArchiveFormat };

export function archiveFormat(head: Buffer): ArchiveFormat | null {
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) return "tar.gz";
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b) {
    const mark = (head[2] as number) * 256 + (head[3] as number);
    if (mark === 0x0304 || mark === 0x0506 || mark === 0x0708) return "zip";
  }
  return null;
}

export function writeRevision(input: {
  bundleSlug: string;
  seq: number;
  body: Readable;
  format?: ArchiveFormat;
}): Promise<UnpackStats> {
  const source = effectReadable(input.body, "bad_tarball", "Cannot read the pushed archive");
  const revision = {
    bundlesRoot: bundlesDir(),
    bundleSlug: input.bundleSlug,
    seq: input.seq,
    source,
    ...(input.format === undefined ? {} : { format: input.format }),
  };
  return runStoragePromise((storage) =>
    storage.writeRevision(revision).pipe(Effect.mapError(toPushError)),
  );
}

export function ensureEntryFile(dir: string): Promise<void> {
  return runStoragePromise((storage) =>
    storage.ensureEntryFile(dir).pipe(Effect.mapError(toPushError)),
  );
}
