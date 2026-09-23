import { Effect, type Path } from "effect";
import { storageError } from "../storage-error";

export function safeEntryPath(
  raw: string,
): Effect.Effect<string, import("../storage-error").StorageError> {
  const unixish = raw.replace(/\\/g, "/");
  if (unixish.includes("\0")) {
    return Effect.fail(
      storageError("unsafe_path", `Entry path contains a NUL byte: ${JSON.stringify(raw)}`),
    );
  }
  if (unixish.startsWith("/") || /^[a-zA-Z]:/.test(unixish)) {
    return Effect.fail(storageError("unsafe_path", `Entry path is absolute: ${raw}`));
  }
  const parts = unixish.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.includes("..")) {
    return Effect.fail(storageError("unsafe_path", `Entry path escapes the bundle: ${raw}`));
  }
  return Effect.succeed(parts.join("/"));
}

export function isMacNoise(relative: string, path: Path.Path): boolean {
  return path.basename(relative).startsWith("._") || relative.split("/")[0] === "__MACOSX";
}

export function resolveInside(path: Path.Path, root: string, relativePath: string): string | null {
  if (relativePath.includes("\0")) return null;
  const target = path.resolve(root, `.${path.sep}${relativePath}`);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}
