import fs from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { createInflateRaw } from "node:zlib";
import { PushError } from "@/server/errors";
import { RevisionSink, type UnpackLimits, type UnpackStats } from "@/server/storage/revision-sink";

/**
 * The zip reader, for archives dropped on the catalog.
 *
 * It decides only what zip means by an entry and hands each one to
 * RevisionSink, the same sink the tar reader feeds, so the limits and the path
 * rules are literally the same code. Nothing here writes a file itself.
 *
 * A zip is read back to front: the central directory at the end is the only
 * listing that carries the sizes and the unix mode bits, so the whole archive
 * is held in memory first. That costs at most `maxCompressedBytes`, which the
 * body is capped at anyway.
 *
 * No dependency: `zlib.inflateRaw` is the whole of deflate, and the directory
 * format below is a hundred lines of fixed-offset reads.
 */

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_MIN_SIZE = 22;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const CENTRAL_FIXED_SIZE = 46;
const LOCAL_SIGNATURE = 0x04034b50;
const LOCAL_FIXED_SIZE = 30;

/** A zip comment is a 16-bit length, so the record cannot start further back. */
const MAX_COMMENT = 0xffff;

const STORED = 0;
const DEFLATED = 8;

/** Set when the entry is encrypted, which Hosti has no password for. */
const FLAG_ENCRYPTED = 0x1;
/** Version-made-by high byte 3 means unix, which is when the mode bits mean anything. */
const HOST_UNIX = 3;
const S_IFMT = 0xf000;
const S_IFLNK = 0xa000;
/** The MS-DOS directory bit, for a zip that names a directory without a trailing slash. */
const DOS_DIRECTORY = 0x10;

type CentralEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  isDirectory: boolean;
  isSymlink: boolean;
  encrypted: boolean;
};

/**
 * Unpack a zip into `destDir` under the same limits a pushed tarball gets.
 * The caller removes `destDir` when this throws.
 */
export async function unpackZip(
  source: Readable,
  destDir: string,
  overrides: Partial<UnpackLimits> = {},
): Promise<UnpackStats> {
  const sink = new RevisionSink(destDir, overrides);
  const archive = await readAll(source, sink.maxCompressedBytes);
  await fs.mkdir(destDir, { recursive: true });

  for (const entry of readCentralDirectory(archive)) {
    if (entry.encrypted) sink.refuse(entry.name, "encrypted entry");
    if (entry.isSymlink) sink.refuse(entry.name, "SymbolicLink");
    if (entry.isDirectory) {
      sink.directory(entry.name);
      continue;
    }
    // The stream is built only after the sink has passed the path and the
    // size, so a path that climbs out of the bundle is refused as a path
    // rather than as a broken offset.
    const write = sink.file(entry.name, entry.uncompressedSize, () =>
      contentStream(archive, entry, sink),
    );
    if (write) await write;
  }
  return sink.finish();
}

/** Hold the body, refusing anything past the compressed limit as it arrives. */
async function readAll(source: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of source) {
    const buffer = Buffer.from(chunk as Buffer);
    total += buffer.length;
    if (total > maxBytes) {
      throw new PushError(
        "push_too_large",
        `Push body is larger than ${maxBytes} bytes compressed`,
        413,
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/** The entry's bytes, inflated when they need it and cut off at the file limit. */
function contentStream(archive: Buffer, entry: CentralEntry, sink: RevisionSink): Readable {
  const start = dataStart(archive, entry);
  const end = start + entry.compressedSize;
  if (end > archive.length) {
    throw new PushError("bad_zip", `${entry.name} runs past the end of the zip`);
  }
  const raw = Readable.from([archive.subarray(start, end)]);
  if (entry.method === STORED) return raw;
  if (entry.method !== DEFLATED) {
    throw new PushError(
      "unsupported_zip",
      `${entry.name} uses compression method ${entry.method}; Hosti reads stored and deflated entries`,
    );
  }
  // A zip may understate a file's size, so the inflated stream is cut off at
  // the limit rather than trusted to stop. Without this a small archive could
  // expand onto the disk without bound before the written size was checked.
  return raw
    .pipe(createInflateRaw())
    .pipe(capped(sink.maxFileBytes, () => sink.tooLarge(entry.name)));
}

function capped(maxBytes: number, error: () => Error): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(error());
        return;
      }
      callback(null, chunk);
    },
  });
}

/** Where this entry's bytes begin, which only its local header knows. */
function dataStart(archive: Buffer, entry: CentralEntry): number {
  const at = entry.localOffset;
  if (at + LOCAL_FIXED_SIZE > archive.length || archive.readUInt32LE(at) !== LOCAL_SIGNATURE) {
    throw new PushError("bad_zip", `${entry.name} has no local header where the directory says`);
  }
  return at + LOCAL_FIXED_SIZE + archive.readUInt16LE(at + 26) + archive.readUInt16LE(at + 28);
}

/** Every entry the archive lists, in the order the directory names them. */
function readCentralDirectory(archive: Buffer): CentralEntry[] {
  const end = findEndRecord(archive);
  const entries: CentralEntry[] = [];
  let at = end.centralOffset;

  for (let index = 0; index < end.entryCount; index += 1) {
    if (at + CENTRAL_FIXED_SIZE > archive.length) {
      throw new PushError("bad_zip", "The zip's directory runs past the end of the file");
    }
    if (archive.readUInt32LE(at) !== CENTRAL_SIGNATURE) {
      throw new PushError("bad_zip", "The zip's directory is not where the file says it is");
    }
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const name = archive.toString(
      "utf8",
      at + CENTRAL_FIXED_SIZE,
      at + CENTRAL_FIXED_SIZE + nameLength,
    );
    const extra = archive.subarray(
      at + CENTRAL_FIXED_SIZE + nameLength,
      at + CENTRAL_FIXED_SIZE + nameLength + extraLength,
    );
    const externalAttributes = archive.readUInt32LE(at + 38);
    const madeByUnix = archive.readUInt16LE(at + 4) >> 8 === HOST_UNIX;
    const mode = externalAttributes >>> 16;

    const sizes = widen(
      {
        uncompressedSize: archive.readUInt32LE(at + 24),
        compressedSize: archive.readUInt32LE(at + 20),
        localOffset: archive.readUInt32LE(at + 42),
      },
      extra,
    );

    entries.push({
      name,
      method: archive.readUInt16LE(at + 10),
      encrypted: (archive.readUInt16LE(at + 8) & FLAG_ENCRYPTED) !== 0,
      isDirectory: name.endsWith("/") || (externalAttributes & DOS_DIRECTORY) !== 0,
      isSymlink: madeByUnix && (mode & S_IFMT) === S_IFLNK,
      ...sizes,
    });
    at += CENTRAL_FIXED_SIZE + nameLength + extraLength + commentLength;
  }
  return entries;
}

type Sizes = { uncompressedSize: number; compressedSize: number; localOffset: number };

/**
 * A field of all ones means the real number moved into the zip64 extra field,
 * which lists only the fields that overflowed, in this order.
 */
function widen(sizes: Sizes, extra: Buffer): Sizes {
  const overflowed =
    sizes.uncompressedSize === 0xffffffff ||
    sizes.compressedSize === 0xffffffff ||
    sizes.localOffset === 0xffffffff;
  if (!overflowed) return sizes;

  const wide = { ...sizes };
  for (let at = 0; at + 4 <= extra.length; ) {
    const id = extra.readUInt16LE(at);
    const size = extra.readUInt16LE(at + 2);
    if (id !== 0x0001) {
      at += 4 + size;
      continue;
    }
    let field = at + 4;
    for (const key of ["uncompressedSize", "compressedSize", "localOffset"] as const) {
      if (sizes[key] !== 0xffffffff) continue;
      if (field + 8 > extra.length) break;
      wide[key] = readSafeUInt64(extra, field);
      field += 8;
    }
    break;
  }
  return wide;
}

function readSafeUInt64(buffer: Buffer, at: number): number {
  const value = buffer.readBigUInt64LE(at);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PushError("push_too_large", "The zip declares a size Hosti will not take");
  }
  return Number(value);
}

type EndRecord = { entryCount: number; centralOffset: number };

/** The end-of-central-directory record, which is the only fixed landmark a zip has. */
function findEndRecord(archive: Buffer): EndRecord {
  const earliest = Math.max(0, archive.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let at = archive.length - EOCD_MIN_SIZE; at >= earliest; at -= 1) {
    if (archive.readUInt32LE(at) !== EOCD_SIGNATURE) continue;
    const entryCount = archive.readUInt16LE(at + 10);
    const centralOffset = archive.readUInt32LE(at + 16);
    if (entryCount === 0xffff || centralOffset === 0xffffffff)
      return findZip64EndRecord(archive, at);
    return { entryCount, centralOffset };
  }
  throw new PushError("bad_zip", "This is not a zip: it has no end-of-directory record");
}

function findZip64EndRecord(archive: Buffer, eocdAt: number): EndRecord {
  const locator = eocdAt - 20;
  if (locator < 0 || archive.readUInt32LE(locator) !== ZIP64_LOCATOR_SIGNATURE) {
    throw new PushError("bad_zip", "The zip claims zip64 sizes but carries no zip64 locator");
  }
  const record = readSafeUInt64(archive, locator + 8);
  if (record + 56 > archive.length || archive.readUInt32LE(record) !== ZIP64_EOCD_SIGNATURE) {
    throw new PushError(
      "bad_zip",
      "The zip's zip64 directory record is not where the locator says",
    );
  }
  return {
    entryCount: readSafeUInt64(archive, record + 32),
    centralOffset: readSafeUInt64(archive, record + 48),
  };
}
