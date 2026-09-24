import { Effect, type FileSystem, type Path, Stream } from "effect";
import type { ArchiveCodec } from "../archive-codec";
import { storageError, type StorageError } from "../storage-error";
import type { UnpackLimits, UnpackStats } from "../types";
import { collectLimited } from "./archive-stream";
import { makeRevisionSink } from "./revision-sink";

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_MIN_SIZE = 22;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const CENTRAL_FIXED_SIZE = 46;
const LOCAL_SIGNATURE = 0x04034b50;
const LOCAL_FIXED_SIZE = 30;
const MAX_COMMENT = 0xffff;
const STORED = 0;
const DEFLATED = 8;
const FLAG_ENCRYPTED = 0x1;
const HOST_UNIX = 3;
const S_IFMT = 0xf000;
const S_IFLNK = 0xa000;
const DOS_DIRECTORY = 0x10;

type CentralEntry = {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localOffset: number;
  readonly isDirectory: boolean;
  readonly isSymlink: boolean;
  readonly encrypted: boolean;
};

type Sizes = {
  readonly uncompressedSize: number;
  readonly compressedSize: number;
  readonly localOffset: number;
};

type EndRecord = {
  readonly entryCount: number;
  readonly centralOffset: number;
};

export const unpackZip = Effect.fnUntraced(function* (
  codec: ArchiveCodec["Service"],
  fs: FileSystem.FileSystem,
  path: Path.Path,
  source: Stream.Stream<Uint8Array, StorageError>,
  destDir: string,
  overrides: Partial<UnpackLimits> = {},
): Effect.fn.Return<UnpackStats, StorageError> {
  const sink = makeRevisionSink(fs, path, destDir, overrides);
  const archive = yield* collectLimited(source, sink.maxCompressedBytes);
  yield* fs
    .makeDirectory(destDir, { recursive: true })
    .pipe(Effect.mapError((cause) => storageError("storage_io", String(cause), 500)));

  const entries = yield* readCentralDirectory(archive);
  for (const entry of entries) {
    if (entry.encrypted) {
      return yield* sink.refuse(entry.name, "encrypted entry");
    }
    if (entry.isSymlink) return yield* sink.refuse(entry.name, "SymbolicLink");
    if (entry.isDirectory) {
      yield* sink.directory(entry.name);
      continue;
    }

    const start = yield* dataStart(archive, entry);
    const end = start + entry.compressedSize;
    if (end > archive.length) {
      return yield* storageError("bad_zip", `${entry.name} runs past the end of the zip`);
    }
    const raw = Stream.make(archive.subarray(start, end));
    let content: Stream.Stream<Uint8Array, StorageError>;
    if (entry.method === STORED) {
      content = raw;
    } else if (entry.method === DEFLATED) {
      content = codec.inflateRaw(raw);
    } else {
      return yield* storageError(
        "unsupported_zip",
        `${entry.name} uses compression method ${entry.method}; Hosti reads stored and deflated entries`,
      );
    }
    yield* sink.file(entry.name, entry.uncompressedSize, content);
  }
  return yield* sink.finish();
});

function readCentralDirectory(
  archive: Uint8Array,
): Effect.Effect<Array<CentralEntry>, StorageError> {
  return Effect.gen(function* () {
    const end = yield* findEndRecord(archive);
    const entries: Array<CentralEntry> = [];
    let offset = end.centralOffset;

    for (let index = 0; index < end.entryCount; index += 1) {
      if (!hasBytes(archive, offset, CENTRAL_FIXED_SIZE)) {
        return yield* storageError("bad_zip", "The zip's directory runs past the end of the file");
      }
      const signature = readU32Unsafe(archive, offset);
      if (signature !== CENTRAL_SIGNATURE) {
        return yield* storageError(
          "bad_zip",
          "The zip's directory is not where the file says it is",
        );
      }
      const nameLength = readU16Unsafe(archive, offset + 28);
      const extraLength = readU16Unsafe(archive, offset + 30);
      const commentLength = readU16Unsafe(archive, offset + 32);
      const variableStart = offset + CENTRAL_FIXED_SIZE;
      const variableEnd = variableStart + nameLength + extraLength + commentLength;
      if (variableEnd > archive.length) {
        return yield* storageError("bad_zip", "The zip's directory runs past the end of the file");
      }
      const name = new TextDecoder().decode(
        archive.subarray(variableStart, variableStart + nameLength),
      );
      const extra = archive.subarray(
        variableStart + nameLength,
        variableStart + nameLength + extraLength,
      );
      const externalAttributes = readU32Unsafe(archive, offset + 38);
      const madeByUnix = readU16Unsafe(archive, offset + 4) >> 8 === HOST_UNIX;
      const mode = externalAttributes >>> 16;
      const sizes = yield* widen(
        {
          uncompressedSize: readU32Unsafe(archive, offset + 24),
          compressedSize: readU32Unsafe(archive, offset + 20),
          localOffset: readU32Unsafe(archive, offset + 42),
        },
        extra,
      );

      entries.push({
        name,
        method: readU16Unsafe(archive, offset + 10),
        encrypted: (readU16Unsafe(archive, offset + 8) & FLAG_ENCRYPTED) !== 0,
        isDirectory: name.endsWith("/") || (externalAttributes & DOS_DIRECTORY) !== 0,
        isSymlink: madeByUnix && (mode & S_IFMT) === S_IFLNK,
        ...sizes,
      });
      offset = variableEnd;
    }
    return entries;
  });
}

function widen(sizes: Sizes, extra: Uint8Array): Effect.Effect<Sizes, StorageError> {
  return Effect.gen(function* () {
    const needsWide =
      sizes.uncompressedSize === 0xffffffff ||
      sizes.compressedSize === 0xffffffff ||
      sizes.localOffset === 0xffffffff;
    if (!needsWide) return sizes;

    const wide = {
      uncompressedSize: sizes.uncompressedSize,
      compressedSize: sizes.compressedSize,
      localOffset: sizes.localOffset,
    };
    for (let offset = 0; offset + 4 <= extra.length; ) {
      const id = readU16Unsafe(extra, offset);
      const size = readU16Unsafe(extra, offset + 2);
      if (id !== 0x0001) {
        offset += 4 + size;
        continue;
      }
      let field = offset + 4;
      for (const key of ["uncompressedSize", "compressedSize", "localOffset"] as const) {
        if (sizes[key] !== 0xffffffff) continue;
        if (!hasBytes(extra, field, 8)) break;
        wide[key] = yield* readSafeUInt64(extra, field);
        field += 8;
      }
      break;
    }
    if (
      wide.uncompressedSize === 0xffffffff ||
      wide.compressedSize === 0xffffffff ||
      wide.localOffset === 0xffffffff
    ) {
      return yield* storageError("bad_zip", "The zip has incomplete zip64 size data");
    }
    return wide;
  });
}

function readSafeUInt64(bytes: Uint8Array, offset: number): Effect.Effect<number, StorageError> {
  if (!hasBytes(bytes, offset, 8)) {
    return Effect.fail(storageError("bad_zip", "The zip has incomplete zip64 size data"));
  }
  const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    return Effect.fail(
      storageError("push_too_large", "The zip declares a size Hosti will not take"),
    );
  }
  return Effect.succeed(Number(value));
}

function findEndRecord(archive: Uint8Array): Effect.Effect<EndRecord, StorageError> {
  const earliest = Math.max(0, archive.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let offset = archive.length - EOCD_MIN_SIZE; offset >= earliest; offset -= 1) {
    if (!hasBytes(archive, offset, EOCD_MIN_SIZE)) continue;
    if (readU32Unsafe(archive, offset) !== EOCD_SIGNATURE) continue;
    const entryCount = readU16Unsafe(archive, offset + 10);
    const centralOffset = readU32Unsafe(archive, offset + 16);
    if (entryCount === 0xffff || centralOffset === 0xffffffff) {
      return findZip64EndRecord(archive, offset);
    }
    return Effect.succeed({ entryCount, centralOffset });
  }
  return Effect.fail(
    storageError("bad_zip", "This is not a zip: it has no end-of-directory record"),
  );
}

function findZip64EndRecord(
  archive: Uint8Array,
  eocdOffset: number,
): Effect.Effect<EndRecord, StorageError> {
  const locator = eocdOffset - 20;
  if (
    !hasBytes(archive, locator, 20) ||
    readU32Unsafe(archive, locator) !== ZIP64_LOCATOR_SIGNATURE
  ) {
    return Effect.fail(
      storageError("bad_zip", "The zip claims zip64 sizes but carries no zip64 locator"),
    );
  }
  return Effect.gen(function* () {
    const recordOffset = yield* readSafeUInt64(archive, locator + 8);
    if (
      !hasBytes(archive, recordOffset, 56) ||
      readU32Unsafe(archive, recordOffset) !== ZIP64_EOCD_SIGNATURE
    ) {
      return yield* storageError(
        "bad_zip",
        "The zip's zip64 directory record is not where the locator says",
      );
    }
    return {
      entryCount: yield* readSafeUInt64(archive, recordOffset + 32),
      centralOffset: yield* readSafeUInt64(archive, recordOffset + 48),
    };
  });
}

function dataStart(archive: Uint8Array, entry: CentralEntry): Effect.Effect<number, StorageError> {
  const offset = entry.localOffset;
  if (
    !hasBytes(archive, offset, LOCAL_FIXED_SIZE) ||
    readU32Unsafe(archive, offset) !== LOCAL_SIGNATURE
  ) {
    return Effect.fail(
      storageError("bad_zip", `${entry.name} has no local header where the directory says`),
    );
  }
  return Effect.succeed(
    offset +
      LOCAL_FIXED_SIZE +
      readU16Unsafe(archive, offset + 26) +
      readU16Unsafe(archive, offset + 28),
  );
}

function hasBytes(bytes: Uint8Array, offset: number, length: number): boolean {
  return offset >= 0 && length >= 0 && offset + length <= bytes.length;
}

function readU16Unsafe(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

function readU32Unsafe(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}
