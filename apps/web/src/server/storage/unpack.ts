import { Effect } from "effect";
import { Transform } from "node:stream";
import type { Readable } from "node:stream";
import type { UnpackLimits, UnpackStats } from "@hosti/storage";
import { PushError } from "@/server/errors";
import { runStoragePromise } from "@/server/runtime";
import { effectReadable, toPushError } from "@/server/storage/compat";

export type { UnpackLimits, UnpackStats };

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

export function unpackTarball(
  source: Readable,
  destDir: string,
  overrides: Partial<UnpackLimits> = {},
): Promise<UnpackStats> {
  const input = effectReadable(source, "bad_tarball", "Cannot read the pushed tarball");
  return runStoragePromise((storage) =>
    storage
      .unpackTarball({ source: input, destDir, limits: overrides })
      .pipe(Effect.mapError(toPushError)),
  );
}

export function normalizeStreamError(error: unknown): Error {
  if (error instanceof PushError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new PushError("bad_tarball", `Cannot read the pushed tarball: ${message}`);
}
