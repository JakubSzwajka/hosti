import fs from "node:fs/promises";
import path from "node:path";
import { create } from "tar";

/** Directory names a bundle never wants, and file noise from macOS. */
const EXCLUDED_DIRS = new Set([".git", "node_modules"]);
const EXCLUDED_FILES = new Set([".DS_Store"]);

export function isExcluded(name: string): boolean {
  return EXCLUDED_DIRS.has(name) || EXCLUDED_FILES.has(name) || name.startsWith("._");
}

export type PackedBundle = {
  /** The gzipped tar to POST. */
  body: Buffer;
  /** Where the files were read from, so a scanner can open them again. */
  root: string;
  /** Paths inside the tarball, relative to `root`, in walk order. */
  files: string[];
};

export class PackError extends Error {}

/** Every file under `root`, excluded names dropped at any depth. */
export async function collectFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (isExcluded(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

async function pack(root: string, files: string[]): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const stream = create({ gzip: true, cwd: root, portable: true, follow: false }, files);
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Pack a directory, or a single `.html` file. The server stores a lone HTML
 * file as `index.html`, which is how a one-file bundle arrives.
 */
export async function packBundle(target: string): Promise<PackedBundle> {
  const absolute = path.resolve(target);
  const stats = await fs.stat(absolute).catch(() => null);
  if (!stats) throw new PackError(`There is nothing at ${absolute}`);

  if (stats.isFile()) {
    const name = path.basename(absolute);
    if (!name.toLowerCase().endsWith(".html")) {
      throw new PackError(`A single-file bundle must be .html, and ${name} is not`);
    }
    const root = path.dirname(absolute);
    return { body: await pack(root, [name]), root, files: [name] };
  }

  if (!stats.isDirectory()) throw new PackError(`${absolute} is neither a file nor a directory`);
  const files = await collectFiles(absolute);
  if (files.length === 0) throw new PackError(`${absolute} holds no files to push`);
  return { body: await pack(absolute, files), root: absolute, files };
}
