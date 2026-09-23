import { bundlesDir } from "@/server/config";
import { runStoragePromise, runStorageSync } from "@/server/runtime";

export function bundleDir(bundleSlug: string): string {
  return runStorageSync((storage) => storage.bundleDir(bundlesDir(), bundleSlug));
}

export function revisionDir(bundleSlug: string, seq: number): string {
  return runStorageSync((storage) => storage.revisionDir(bundlesDir(), bundleSlug, seq));
}

export function currentLink(bundleSlug: string): string {
  return runStorageSync((storage) => storage.currentLink(bundlesDir(), bundleSlug));
}

export async function currentRevisionRoot(bundleSlug: string): Promise<string | null> {
  return runStoragePromise((storage) => storage.currentRevisionRoot(bundlesDir(), bundleSlug));
}

export function resolveInside(root: string, relativePath: string): string | null {
  return runStorageSync((storage) => storage.resolveInside(root, relativePath));
}
