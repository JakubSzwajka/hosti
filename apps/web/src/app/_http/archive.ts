import { NodeStream } from "@effect/platform-node";
import { StorageError, type ArchiveFormat } from "@hosti/storage";
import type { Readable } from "node:stream";

export function archiveSource(source: Readable, code: string, message: string) {
  return NodeStream.fromReadable({
    evaluate: () => source,
    onError: (cause) => {
      if (cause instanceof StorageError) return cause;
      const detail = cause instanceof Error ? cause.message : String(cause);
      return new StorageError({ code, message: `${message}: ${detail}`, status: 400 });
    },
  });
}

export function archiveFormat(head: Buffer): ArchiveFormat | null {
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) return "tar.gz";
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b) {
    const mark = (head[2] as number) * 256 + (head[3] as number);
    if (mark === 0x0304 || mark === 0x0506 || mark === 0x0708) return "zip";
  }
  return null;
}
