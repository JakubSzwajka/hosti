import { Effect, type FileSystem, type Path } from "effect";
import type { StorageError } from "../storage-error";
import { resolveInside } from "./entry-path";

export function bundleDir(path: Path.Path, bundlesRoot: string, bundleSlug: string): string {
  return path.join(bundlesRoot, bundleSlug);
}

export function revisionDir(
  path: Path.Path,
  bundlesRoot: string,
  bundleSlug: string,
  seq: number,
): string {
  return path.join(bundleDir(path, bundlesRoot, bundleSlug), `r${seq}`);
}

export function currentLink(path: Path.Path, bundlesRoot: string, bundleSlug: string): string {
  return path.join(bundleDir(path, bundlesRoot, bundleSlug), "current");
}

export function currentRevisionRoot(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  bundlesRoot: string,
  bundleSlug: string,
): Effect.Effect<string | null, never> {
  return fs
    .realPath(currentLink(path, bundlesRoot, bundleSlug))
    .pipe(Effect.orElseSucceed(() => null));
}

export function resolveInsideEffect(
  path: Path.Path,
  root: string,
  relativePath: string,
): Effect.Effect<string | null, StorageError> {
  return Effect.succeed(resolveInside(path, root, relativePath));
}
