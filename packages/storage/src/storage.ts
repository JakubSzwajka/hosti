import { Context, Effect, FileSystem, Layer, Path, type Stream } from "effect";
import * as Crypto from "effect/Crypto";
import { ArchiveCodec } from "./archive-codec";
import type { StorageError } from "./storage-error";
import type { ArchiveFormat, StorageSink, UnpackLimits, UnpackStats } from "./types";
import { safeEntryPath } from "./internal/entry-path";
import {
  bundleDir,
  currentLink,
  currentRevisionRoot,
  resolveInsideEffect,
  revisionDir,
} from "./internal/paths";
import { ensureEntryFile, writeRevision } from "./internal/revisions";
import { makeRevisionSink } from "./internal/revision-sink";
import { unpackTarball } from "./internal/unpack";
import { unpackZip } from "./internal/unzip";

export class Storage extends Context.Service<
  Storage,
  {
    bundleDir(bundlesRoot: string, bundleSlug: string): Effect.Effect<string>;
    revisionDir(bundlesRoot: string, bundleSlug: string, seq: number): Effect.Effect<string>;
    currentLink(bundlesRoot: string, bundleSlug: string): Effect.Effect<string>;
    currentRevisionRoot(bundlesRoot: string, bundleSlug: string): Effect.Effect<string | null>;
    resolveInside(root: string, relativePath: string): Effect.Effect<string | null, StorageError>;
    safeEntryPath(raw: string): Effect.Effect<string, StorageError>;
    makeRevisionSink(
      destDir: string,
      overrides?: Partial<UnpackLimits>,
    ): Effect.Effect<StorageSink>;
    unpackTarball(input: {
      readonly source: Stream.Stream<Uint8Array, StorageError>;
      readonly destDir: string;
      readonly limits?: Partial<UnpackLimits>;
    }): Effect.Effect<UnpackStats, StorageError>;
    unpackZip(input: {
      readonly source: Stream.Stream<Uint8Array, StorageError>;
      readonly destDir: string;
      readonly limits?: Partial<UnpackLimits>;
    }): Effect.Effect<UnpackStats, StorageError>;
    ensureEntryFile(dir: string): Effect.Effect<void, StorageError>;
    writeRevision(input: {
      readonly bundlesRoot: string;
      readonly bundleSlug: string;
      readonly seq: number;
      readonly source: Stream.Stream<Uint8Array, StorageError>;
      readonly format?: ArchiveFormat;
      readonly limits?: Partial<UnpackLimits>;
    }): Effect.Effect<UnpackStats, StorageError>;
  }
>()("@hosti/storage/Storage") {
  static readonly layer: Layer.Layer<
    Storage,
    never,
    ArchiveCodec | FileSystem.FileSystem | Path.Path | Crypto.Crypto
  > = Layer.effect(
    Storage,
    Effect.gen(function* () {
      const archiveCodec = yield* ArchiveCodec;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;

      const methods = Storage.of({
        bundleDir: (bundlesRoot, bundleSlug) =>
          Effect.succeed(bundleDir(path, bundlesRoot, bundleSlug)),
        revisionDir: (bundlesRoot, bundleSlug, seq) =>
          Effect.succeed(revisionDir(path, bundlesRoot, bundleSlug, seq)),
        currentLink: (bundlesRoot, bundleSlug) =>
          Effect.succeed(currentLink(path, bundlesRoot, bundleSlug)),
        currentRevisionRoot: (bundlesRoot, bundleSlug) =>
          currentRevisionRoot(fs, path, bundlesRoot, bundleSlug),
        resolveInside: (root, relativePath) => resolveInsideEffect(path, root, relativePath),
        safeEntryPath,
        makeRevisionSink: (destDir, overrides) =>
          Effect.succeed(makeRevisionSink(fs, path, destDir, overrides)),
        unpackTarball: ({ source, destDir, limits }) =>
          unpackTarball(archiveCodec, fs, path, source, destDir, limits),
        unpackZip: ({ source, destDir, limits }) =>
          unpackZip(archiveCodec, fs, path, source, destDir, limits),
        ensureEntryFile: (dir) => ensureEntryFile(fs, path, dir),
        writeRevision: (input) =>
          writeRevision({ archiveCodec, fileSystem: fs, path, crypto }, input),
      });
      return methods;
    }),
  );
}
