import { Effect } from "effect";
import type { Readable } from "node:stream";
import type { UnpackLimits, UnpackStats } from "@hosti/storage";
import { runStoragePromise } from "@/server/runtime";
import { effectReadable, toPushError } from "@/server/storage/compat";

export function unpackZip(
  source: Readable,
  destDir: string,
  overrides: Partial<UnpackLimits> = {},
): Promise<UnpackStats> {
  const input = effectReadable(source, "bad_zip", "Cannot read the pushed zip");
  return runStoragePromise((storage) =>
    storage
      .unpackZip({ source: input, destDir, limits: overrides })
      .pipe(Effect.mapError(toPushError)),
  );
}
