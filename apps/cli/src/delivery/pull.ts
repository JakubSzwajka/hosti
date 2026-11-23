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

async function realpathOrLogical(target: string): Promise<string> {
  try {
    return await fs.realpath(target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return target;
    throw error;
  }
}

async function assertSafeDestination(
  logicalDestination: string,
  physicalDestination: string,
): Promise<void> {
  const destinations = [path.resolve(logicalDestination), path.resolve(physicalDestination)];
  const logicalHome = path.resolve(os.homedir());
  const logicalCwd = path.resolve(process.cwd());
  const protectedPaths = [
    logicalHome,
    await realpathOrLogical(logicalHome),
    logicalCwd,
    await realpathOrLogical(logicalCwd),
  ];
  const contains = (parent: string, child: string) =>
    child === parent || child.startsWith(`${parent}${path.sep}`);
  if (
    destinations.some(
      (destination) =>
        destination === path.parse(destination).root ||
        protectedPaths.some((protectedPath) => contains(destination, protectedPath)),
    )
  ) {
    throw new PullError(`Refusing dangerous output path ${physicalDestination}`);
  }
}

async function physicalDestination(destination: string): Promise<string> {
  const parent = path.dirname(destination);
  try {
    return path.join(await fs.realpath(parent), path.basename(destination));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const physicalParent = await physicalDestination(parent);
    return path.join(physicalParent, path.basename(destination));
  }
}

async function ensureDestination(destination: string, force: boolean): Promise<string> {
  const resolved = await physicalDestination(destination);
  await assertSafeDestination(destination, resolved);
  const existing = await fs.lstat(resolved).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!existing) return resolved;
  if (existing.isSymbolicLink()) throw new PullError(`Output path is a symlink: ${resolved}`);
  if (!existing.isDirectory()) throw new PullError(`Output path is not a directory: ${resolved}`);
  if (force) return resolved;
  if ((await fs.readdir(resolved)).length > 0) {
    throw new PullError(`Output directory is not empty: ${resolved}; pass --force to replace it`);
  }
  return resolved;
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
  if (!/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/.test(slug)) {
    throw new PullError(`Invalid bundle slug: ${slug}`);
  }
  const requestedDestination = path.resolve(flags.out ?? slug);
  const destination = await ensureDestination(requestedDestination, flags.force ?? false);
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
