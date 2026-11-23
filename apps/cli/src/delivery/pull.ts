import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Parser, x as extract } from "tar";
import { Readable } from "node:stream";
import type { Flags } from "./args.ts";
import type { Client } from "./client.ts";
import { say, type Writer } from "./output.ts";

export class PullError extends Error {}

type PullContext = { target: string; flags: Flags; client: Pick<Client, "pull">; out: Writer };

function safeEntry(name: string): void {
  const parts = name.replaceAll("\\", "/").split("/");
  if (
    !name ||
    name.includes("\0") ||
    path.posix.isAbsolute(name) ||
    path.win32.isAbsolute(name) ||
    parts.includes("..")
  ) {
    throw new PullError(`Unsafe archive path: ${name}`);
  }
}

async function inspectArchive(archive: Buffer): Promise<{ fileCount: number; bytes: number }> {
  const parser = new Parser({ strict: true });
  let fileCount = 0;
  let bytes = 0;
  parser.on("entry", (entry) => {
    try {
      safeEntry(entry.path);
    } catch (error) {
      parser.abort(error instanceof Error ? error : new PullError(String(error)));
      entry.resume();
      return;
    }
    if (entry.type === "File") {
      fileCount += 1;
      bytes += entry.size;
    } else if (entry.type !== "Directory") {
      parser.abort(new PullError(`Unsafe archive entry type: ${entry.type}`));
    }
    entry.resume();
  });
  await new Promise<void>((resolve, reject) => {
    parser.on("end", resolve);
    parser.on("error", reject);
    Readable.from(archive).pipe(parser);
  });
  if (fileCount === 0) throw new PullError("The archive contains no files");
  return { fileCount, bytes };
}

function assertSafeDestination(destination: string): void {
  const resolved = path.resolve(destination);
  const home = path.resolve(os.homedir());
  const cwd = path.resolve(process.cwd());
  const contains = (parent: string, child: string) =>
    child === parent || child.startsWith(`${parent}${path.sep}`);
  if (
    resolved === path.parse(resolved).root ||
    contains(resolved, home) ||
    contains(resolved, cwd)
  ) {
    throw new PullError(`Refusing dangerous output path ${resolved}`);
  }
}

async function rejectSymlinkAncestors(destination: string): Promise<void> {
  let current = path.parse(destination).root;
  for (const part of destination.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) {
        throw new PullError(`Output path contains a symlink: ${current}`);
      }
    } catch (error) {
      if (error instanceof PullError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function ensureDestination(destination: string, force: boolean): Promise<void> {
  assertSafeDestination(destination);
  await rejectSymlinkAncestors(destination);
  const existing = await fs.lstat(destination).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!existing) return;
  if (!existing.isDirectory())
    throw new PullError(`Output path is not a directory: ${destination}`);
  if (force) return;
  if ((await fs.readdir(destination)).length > 0) {
    throw new PullError(
      `Output directory is not empty: ${destination}; pass --force to replace it`,
    );
  }
}

async function installStage(stage: string, destination: string, force: boolean): Promise<void> {
  const existing = await fs.lstat(destination).catch(() => null);
  if (!existing) {
    await fs.rename(stage, destination);
    return;
  }
  if (!force) {
    await fs.rmdir(destination);
    await fs.rename(stage, destination);
    return;
  }
  const backup = `${destination}.hosti-backup-${randomUUID()}`;
  await fs.rename(destination, backup);
  try {
    await fs.rename(stage, destination);
  } catch (error) {
    await fs.rename(backup, destination);
    throw error;
  }
  await fs.rm(backup, { recursive: true, force: true });
}

export async function pull(context: PullContext): Promise<void> {
  const { target: slug, flags, client } = context;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new PullError(`Invalid bundle slug: ${slug}`);
  const destination = path.resolve(flags.out ?? slug);
  await ensureDestination(destination, flags.force ?? false);
  const { archive, revision } = await client.pull(slug, flags.revision);
  const counts = await inspectArchive(archive);
  const parent = path.dirname(destination);
  await fs.mkdir(parent, { recursive: true });
  const container = await fs.mkdtemp(path.join(parent, `.${path.basename(destination)}-hosti-`));
  const stage = path.join(container, "tree");
  try {
    await fs.mkdir(stage);
    const archivePath = path.join(container, "archive.tar.gz");
    await fs.writeFile(archivePath, archive, { flag: "wx", mode: 0o600 });
    await extract({ file: archivePath, cwd: stage, strict: true, preservePaths: false });
    await installStage(stage, destination, flags.force ?? false);
  } finally {
    await fs.rm(container, { recursive: true, force: true });
  }
  say(context.out, "revision", String(revision));
  say(context.out, "files", String(counts.fileCount));
  say(context.out, "bytes", String(counts.bytes));
  context.out(destination);
}
