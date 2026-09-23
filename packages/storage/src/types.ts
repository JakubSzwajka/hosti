import type { PushLimits } from "@hosti/shared";
import type { Effect, Stream } from "effect";
import type { StorageError } from "./storage-error";

export type ArchiveFormat = "tar.gz" | "zip";

export type UnpackStats = {
  fileCount: number;
  byteSize: number;
};

export type UnpackLimits = PushLimits;

export type ArchiveEntryKind = "file" | "directory" | "other";

export type ArchiveEntry = {
  readonly path: string;
  readonly kind: ArchiveEntryKind;
  readonly size: number;
  readonly content: Stream.Stream<Uint8Array, StorageError>;
};

export type StorageSink = {
  readonly stats: UnpackStats;
  readonly maxCompressedBytes: number;
  readonly maxFileBytes: number;
  directory(rawPath: string): Effect.Effect<void, StorageError>;
  file(
    rawPath: string,
    declaredSize: number,
    content: Stream.Stream<Uint8Array, StorageError>,
  ): Effect.Effect<undefined | null, StorageError>;
  refuse(rawPath: string, typeName: string): Effect.Effect<never, StorageError>;
  finish(): Effect.Effect<UnpackStats, StorageError>;
};
