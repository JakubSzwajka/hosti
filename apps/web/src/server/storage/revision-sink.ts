import { PUSH_LIMITS, type PushLimits } from "@hosti/shared";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { PushError } from "@/server/errors";

/**
 * The one place a revision's files get judged and written.
 *
 * A bundle arrives as a gzipped tar from `hosti push` or as a zip from the
 * catalog's drop zone. The two containers are read by two different readers,
 * and both hand every entry to this sink, so the limits, the path rules and
 * the refusal behaviour cannot drift apart between them.
 */

export type UnpackStats = { fileCount: number; byteSize: number };

/** The limits a push is held to. Tests lower them; the app always uses PUSH_LIMITS. */
export type UnpackLimits = PushLimits;

/**
 * Turn an archive entry path into a safe revision-relative path, or refuse it.
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

export class RevisionSink {
  readonly stats: UnpackStats = { fileCount: 0, byteSize: 0 };
  private readonly destDir: string;
  private readonly limits: UnpackLimits;

  constructor(destDir: string, overrides: Partial<UnpackLimits> = {}) {
    this.destDir = destDir;
    this.limits = { ...PUSH_LIMITS, ...overrides };
  }

  get maxCompressedBytes(): number {
    return this.limits.maxCompressedBytes;
  }

  get maxFileBytes(): number {
    return this.limits.maxFileBytes;
  }

  /** Make a directory the archive named. Throws on a path that will not do. */
  directory(rawPath: string): void {
    const relative = safeEntryPath(rawPath);
    if (!relative || isMacNoise(relative)) return;
    mkdirSync(path.join(this.destDir, relative), { recursive: true });
  }

  /**
   * Take one file. Everything that can be judged from the header is judged
   * before a byte is read, so a refusal costs nothing; the returned promise
   * settles once the bytes are on disk. `null` means the entry was dropped on
   * purpose and its stream still needs draining by the caller.
   */
  file(rawPath: string, declaredSize: number, content: () => Readable): Promise<void> | null {
    const relative = safeEntryPath(rawPath);
    if (!relative) {
      throw new PushError("unsafe_path", `Entry ${rawPath} has no name`);
    }
    if (isMacNoise(relative)) return null;

    this.stats.fileCount += 1;
    if (this.stats.fileCount > this.limits.maxFiles) {
      throw new PushError(
        "too_many_files",
        `A bundle may hold at most ${this.limits.maxFiles} files`,
      );
    }
    if (declaredSize > this.limits.maxFileBytes) throw this.tooLarge(relative);

    const full = path.join(this.destDir, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    const target = createWriteStream(full);
    return pipeline(content(), target).then(() => {
      // The header can lie about the size, so the bytes are counted too.
      if (target.bytesWritten > this.limits.maxFileBytes) throw this.tooLarge(relative);
      this.stats.byteSize += target.bytesWritten;
    });
  }

  /** Anything that is neither a file nor a directory. Symlinks land here. */
  refuse(rawPath: string, typeName: string): never {
    throw new PushError("unsafe_entry", `Entry ${rawPath} is a ${typeName}, which Hosti refuses`);
  }

  /** The counts, once every write has settled. An archive of nothing is refused. */
  finish(): UnpackStats {
    if (this.stats.fileCount === 0) {
      throw new PushError("empty_push", "The pushed archive holds no files");
    }
    return this.stats;
  }

  /** The refusal for one file. Public so a reader can cut a stream off early. */
  tooLarge(relative: string): PushError {
    return new PushError(
      "file_too_large",
      `${relative} is larger than ${this.limits.maxFileBytes} bytes`,
    );
  }
}

/**
 * What macOS adds to an archive and nobody asked for: AppleDouble sidecars
 * from `tar`, and the `__MACOSX` tree from the Finder's Compress. A stray
 * `._note.html` would break the lone-HTML rule, so neither is ever content.
 */
function isMacNoise(relative: string): boolean {
  return path.basename(relative).startsWith("._") || relative.split("/")[0] === "__MACOSX";
}
