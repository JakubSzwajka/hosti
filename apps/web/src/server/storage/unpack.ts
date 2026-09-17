import { PUSH_LIMITS, type PushLimits } from "@hosti/shared";
import { createWriteStream, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { Parser, type ReadEntry } from "tar";
import { PushError } from "@/server/errors";

export type UnpackStats = { fileCount: number; byteSize: number };

/** The limits a push is held to. Tests lower them; the app always uses PUSH_LIMITS. */
export type UnpackLimits = PushLimits;

const FILE_TYPES = new Set(["File", "OldFile", "ContiguousFile"]);
const DIRECTORY_TYPES = new Set(["Directory", "GNUDumpDir"]);

/**
 * Turn a tar entry path into a safe repository-relative path, or refuse it.
 * Empty means "the root of the tree", which only a directory entry may be.
 */
export function safeEntryPath(raw: string): string {
  const unixish = raw.replace(/\\/g, "/");
  if (unixish.includes("\0")) {
    throw new PushError("unsafe_path", `Entry path contains a NUL byte: ${JSON.stringify(raw)}`);
  }
  if (unixish.startsWith("/") || /^[a-zA-Z]:/.test(unixish)) {
    throw new PushError("unsafe_path", `Entry path is absolute: ${raw}`);
  }
  const parts = unixish.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.includes("..")) {
    throw new PushError("unsafe_path", `Entry path escapes the bundle: ${raw}`);
  }
  return parts.join("/");
}

function countingStream(maxBytes: number): Transform {
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

/**
 * Unpack a gzipped tar into `destDir`, enforcing every limit while it writes
 * rather than after. The caller removes `destDir` when this throws.
 */
export async function unpackTarball(
  source: Readable,
  destDir: string,
  overrides: Partial<UnpackLimits> = {},
): Promise<UnpackStats> {
  const limits: UnpackLimits = { ...PUSH_LIMITS, ...overrides };
  await fs.mkdir(destDir, { recursive: true });

  const stats: UnpackStats = { fileCount: 0, byteSize: 0 };
  const writes: Promise<void>[] = [];
  const parser = new Parser();
  let failure: Error | null = null;

  const fail = (error: Error) => {
    failure ??= error;
  };

  parser.on("entry", (entry: ReadEntry) => {
    if (failure) {
      entry.resume();
      return;
    }
    try {
      writes.push(writeEntry(entry, destDir, stats, limits));
    } catch (error) {
      fail(error as Error);
      entry.resume();
    }
  });

  const counter = countingStream(limits.maxCompressedBytes);
  const gunzip = createGunzip();
  source.on("error", (error) => counter.destroy(error));
  counter.on("error", (error) => gunzip.destroy(error));
  source.pipe(counter).pipe(gunzip);

  try {
    for await (const chunk of gunzip) {
      if (failure) break;
      if (!parser.write(chunk as Buffer)) {
        await new Promise<void>((resolve) => parser.once("drain", resolve));
      }
    }
    if (!failure) parser.end();
  } catch (error) {
    fail(normalizeStreamError(error));
  }

  const settled = await Promise.allSettled(writes);
  for (const result of settled) {
    if (result.status === "rejected") fail(result.reason as Error);
  }
  if (failure) throw failure;
  if (stats.fileCount === 0) {
    throw new PushError("empty_push", "The pushed tarball holds no files");
  }
  return stats;
}

function normalizeStreamError(error: unknown): Error {
  if (error instanceof PushError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new PushError("bad_tarball", `Cannot read the pushed tarball: ${message}`);
}

function writeEntry(
  entry: ReadEntry,
  destDir: string,
  stats: UnpackStats,
  limits: UnpackLimits,
): Promise<void> {
  const type = String(entry.type);
  const relative = safeEntryPath(entry.path);

  if (DIRECTORY_TYPES.has(type)) {
    if (relative) mkdirSync(path.join(destDir, relative), { recursive: true });
    entry.resume();
    return Promise.resolve();
  }
  if (!FILE_TYPES.has(type)) {
    throw new PushError("unsafe_entry", `Entry ${entry.path} is a ${type}, which Hosti refuses`);
  }
  if (!relative) {
    throw new PushError("unsafe_path", `Entry ${entry.path} has no name`);
  }
  // macOS `tar` packs extended attributes as AppleDouble sidecars. They are
  // never content, and a stray `._note.html` would break the lone-HTML rule.
  if (path.basename(relative).startsWith("._")) {
    entry.resume();
    return Promise.resolve();
  }

  stats.fileCount += 1;
  if (stats.fileCount > limits.maxFiles) {
    throw new PushError("too_many_files", `A bundle may hold at most ${limits.maxFiles} files`);
  }
  if ((entry.size ?? 0) > limits.maxFileBytes) {
    throw new PushError(
      "file_too_large",
      `${relative} is larger than ${limits.maxFileBytes} bytes`,
    );
  }

  const full = path.join(destDir, relative);
  mkdirSync(path.dirname(full), { recursive: true });
  const target = createWriteStream(full);
  return pipeline(entry, target).then(() => {
    if (target.bytesWritten > limits.maxFileBytes) {
      throw new PushError(
        "file_too_large",
        `${relative} is larger than ${limits.maxFileBytes} bytes`,
      );
    }
    stats.byteSize += target.bytesWritten;
  });
}
