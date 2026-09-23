import { Effect } from "effect";
import type { Readable } from "node:stream";
import type { StorageSink, UnpackLimits, UnpackStats } from "@hosti/storage";
import { PushError } from "@/server/errors";
import { runStoragePromise, runStorageSync } from "@/server/runtime";
import { effectReadable, toPushError } from "@/server/storage/compat";

export type { UnpackLimits, UnpackStats };

export function safeEntryPath(raw: string): string {
  return runStorageSync((storage) => storage.safeEntryPath(raw).pipe(Effect.mapError(toPushError)));
}

export class RevisionSink {
  readonly stats: UnpackStats;
  readonly maxCompressedBytes: number;
  readonly maxFileBytes: number;
  private readonly sink: StorageSink;

  constructor(destDir: string, overrides: Partial<UnpackLimits> = {}) {
    this.sink = runStorageSync((storage) => storage.makeRevisionSink(destDir, overrides));
    this.stats = this.sink.stats;
    this.maxCompressedBytes = this.sink.maxCompressedBytes;
    this.maxFileBytes = this.sink.maxFileBytes;
  }

  directory(rawPath: string): void {
    runStorageSync(() => this.sink.directory(rawPath).pipe(Effect.mapError(toPushError)));
  }

  file(rawPath: string, declaredSize: number, content: () => Readable): Promise<void> | null {
    const relative = safeEntryPath(rawPath);
    if (!relative) {
      throw new PushError("unsafe_path", `Entry ${rawPath} has no name`);
    }
    if (relative.split("/")[0] === "__MACOSX" || relative.split("/").at(-1)?.startsWith("._")) {
      return null;
    }
    const source = effectReadable(content(), "bad_tarball", "Cannot read a tar entry");
    return runStoragePromise(() =>
      this.sink.file(rawPath, declaredSize, source).pipe(Effect.mapError(toPushError)),
    ).then(() => undefined);
  }

  refuse(rawPath: string, typeName: string): never {
    return runStorageSync(() =>
      this.sink.refuse(rawPath, typeName).pipe(Effect.mapError(toPushError)),
    );
  }

  finish(): UnpackStats {
    return runStorageSync(() => this.sink.finish().pipe(Effect.mapError(toPushError)));
  }

  tooLarge(relative: string): PushError {
    return new PushError("file_too_large", `${relative} is larger than ${this.maxFileBytes} bytes`);
  }
}
