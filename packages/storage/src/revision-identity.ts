import { Context, type Effect } from "effect";
import type { StorageError } from "./storage-error";

export function directoryIdentity(info: {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly birthtimeNs: bigint;
}): string | null {
  if (info.ino <= 0n || info.birthtimeNs <= 0n) return null;
  return `${info.dev}:${info.ino}:${info.birthtimeNs}`;
}

export class RevisionIdentity extends Context.Service<
  RevisionIdentity,
  {
    read(directory: string): Effect.Effect<string, StorageError>;
  }
>()("@hosti/storage/RevisionIdentity") {}
