import { ENTRY_FILE } from "@hosti/shared";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { PushError } from "@/server/errors";
import { bundleDir, currentLink, revisionDir } from "@/server/storage/paths";
import type { UnpackStats } from "@/server/storage/revision-sink";
import { unpackTarball } from "@/server/storage/unpack";
import { unpackZip } from "@/server/storage/unzip";

/** The two containers a bundle arrives in. Both end up in the same sink. */
export type ArchiveFormat = "tar.gz" | "zip";

/**
 * Which container these bytes are, read from the bytes rather than the name.
 * A file called `.zip` that is really a tarball still unpacks, and a renamed
 * anything-else is refused before a directory is made.
 */
export function archiveFormat(head: Buffer): ArchiveFormat | null {
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) return "tar.gz";
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b) {
    // Local file header, empty archive, or the spanning marker.
    const mark = (head[2] as number) * 256 + (head[3] as number);
    if (mark === 0x0304 || mark === 0x0506 || mark === 0x0708) return "zip";
  }
  return null;
}

/**
 * Unpack one push into a fresh `r<seq>` directory, prove it has an entry file,
 * then flip `current` onto it. A push that fails at any step leaves no
 * directory behind and leaves `current` where it was.
 */
export async function writeRevision(input: {
  bundleSlug: string;
  seq: number;
  body: Readable;
  /** How the bytes are wrapped. The push API speaks gzipped tar only. */
  format?: ArchiveFormat;
}): Promise<UnpackStats> {
  const dir = revisionDir(input.bundleSlug, input.seq);
  const unpack = input.format === "zip" ? unpackZip : unpackTarball;
  await fs.rm(dir, { recursive: true, force: true });
  try {
    const stats = await unpack(input.body, dir);
    await ensureEntryFile(dir);
    await flipCurrent(input.bundleSlug, input.seq);
    return stats;
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Entry file rule: `index.html` at the root wins. Failing that, a lone root
 * `.html` file is stored as `index.html`, which is how a single-file bundle
 * arrives. Anything else is a push Hosti cannot serve.
 */
export async function ensureEntryFile(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  if (files.some((file) => file.name === ENTRY_FILE)) return;

  const htmlFiles = files.filter((file) => file.name.toLowerCase().endsWith(".html"));
  const only = htmlFiles[0];
  if (htmlFiles.length === 1 && only) {
    await fs.rename(path.join(dir, only.name), path.join(dir, ENTRY_FILE));
    return;
  }

  const found = entries.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name));
  const listed = found.length ? found.slice(0, 20).join(", ") : "nothing";
  throw new PushError(
    "no_entry_file",
    htmlFiles.length > 1
      ? `No ${ENTRY_FILE} at the root and ${htmlFiles.length} HTML files to choose from: ${listed}`
      : `No ${ENTRY_FILE} at the root of the pushed tree. Found: ${listed}`,
  );
}

/** Atomic swap: build the new symlink beside `current`, then rename over it. */
async function flipCurrent(bundleSlug: string, seq: number): Promise<void> {
  const link = currentLink(bundleSlug);
  const staging = path.join(bundleDir(bundleSlug), `.current-${randomBytes(6).toString("hex")}`);
  await fs.symlink(`r${seq}`, staging);
  try {
    await fs.rename(staging, link);
  } catch (error) {
    await fs.rm(staging, { force: true });
    throw error;
  }
}
