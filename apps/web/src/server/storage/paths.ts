import fs from "node:fs/promises";
import path from "node:path";
import { bundlesDir } from "@/server/config";

export function bundleDir(bundleSlug: string): string {
  return path.join(bundlesDir(), bundleSlug);
}

export function revisionDir(bundleSlug: string, seq: number): string {
  return path.join(bundleDir(bundleSlug), `r${seq}`);
}

export function currentLink(bundleSlug: string): string {
  return path.join(bundleDir(bundleSlug), "current");
}

export async function currentRevisionRoot(bundleSlug: string): Promise<string | null> {
  try {
    return await fs.realpath(currentLink(bundleSlug));
  } catch {
    return null;
  }
}

export function resolveInside(root: string, relativePath: string): string | null {
  if (relativePath.includes("\0")) return null;
  const target = path.resolve(root, `.${path.posix.sep}${relativePath}`);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}
