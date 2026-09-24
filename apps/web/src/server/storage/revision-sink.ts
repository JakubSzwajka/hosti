import { Effect } from "effect";
import { runStorageSync } from "@/server/runtime";
import { toPushError } from "@/server/storage/compat";

export type { UnpackLimits, UnpackStats } from "@hosti/storage";

export function safeEntryPath(raw: string): string {
  return runStorageSync((storage) => storage.safeEntryPath(raw).pipe(Effect.mapError(toPushError)));
}
