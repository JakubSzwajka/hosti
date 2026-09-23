import { PUSH_LIMITS, type PushLimits } from "@hosti/shared";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { PushError } from "@/server/errors";

export type UnpackStats = { fileCount: number; byteSize: number };

export type UnpackLimits = PushLimits;

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

  directory(rawPath: string): void {
    const relative = safeEntryPath(rawPath);
    if (!relative || isMacNoise(relative)) return;
    mkdirSync(path.join(this.destDir, relative), { recursive: true });
  }

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
      // Headers can understate size, so enforce the limit on bytes actually written.
      if (target.bytesWritten > this.limits.maxFileBytes) throw this.tooLarge(relative);
      this.stats.byteSize += target.bytesWritten;
    });
  }

  refuse(rawPath: string, typeName: string): never {
    throw new PushError("unsafe_entry", `Entry ${rawPath} is a ${typeName}, which Hosti refuses`);
  }

  finish(): UnpackStats {
    if (this.stats.fileCount === 0) {
      throw new PushError("empty_push", "The pushed archive holds no files");
    }
    return this.stats;
  }

  tooLarge(relative: string): PushError {
    return new PushError(
      "file_too_large",
      `${relative} is larger than ${this.limits.maxFileBytes} bytes`,
    );
  }
}

function isMacNoise(relative: string): boolean {
  return path.basename(relative).startsWith("._") || relative.split("/")[0] === "__MACOSX";
}
