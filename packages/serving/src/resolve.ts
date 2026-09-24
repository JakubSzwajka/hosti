import { ENTRY_FILE } from "@hosti/shared";
import { Effect, type FileSystem, type Path } from "effect";
import type { Resolution } from "./types";

type Kind = "file" | "directory" | null;

function kindOf(fs: FileSystem.FileSystem, absolutePath: string): Effect.Effect<Kind> {
  return fs.stat(absolutePath).pipe(
    Effect.map((stat) => {
      if (stat.type === "File") return "file" as const;
      if (stat.type === "Directory") return "directory" as const;
      return null;
    }),
    Effect.orElseSucceed(() => null),
  );
}

function resolveInside(path: Path.Path, root: string, relativePath: string): string | null {
  if (relativePath.includes("\0")) return null;
  const target = path.resolve(root, `.${path.sep}${relativePath}`);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

export function resolveBundleRequest(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  sharePrefix: string,
  requestPath: string,
): Effect.Effect<Resolution> {
  if (requestPath === "") {
    return Effect.succeed({ kind: "redirect", to: `${sharePrefix}/` });
  }

  const relative = decodePath(requestPath.replace(/^\/+/, ""));
  if (relative === null) return Effect.succeed({ kind: "not-found" });

  const wantsDirectory = requestPath.endsWith("/");
  const target = resolveInside(path, root, relative);
  if (!target) return Effect.succeed({ kind: "not-found" });

  if (wantsDirectory) {
    const index = resolveInside(path, root, `${relative}${ENTRY_FILE}`);
    if (!index) return Effect.succeed({ kind: "not-found" });
    return kindOf(fs, index).pipe(
      Effect.map(
        (kind): Resolution =>
          kind === "file" ? { kind: "file", absolutePath: index } : { kind: "not-found" },
      ),
    );
  }

  return Effect.gen(function* () {
    const direct = yield* kindOf(fs, target);
    if (direct === "file") return { kind: "file", absolutePath: target } satisfies Resolution;
    if (direct === "directory") {
      return { kind: "redirect", to: `${sharePrefix}${requestPath}/` } satisfies Resolution;
    }

    const withHtml = resolveInside(path, root, `${relative}.html`);
    if (withHtml && (yield* kindOf(fs, withHtml)) === "file") {
      return { kind: "file", absolutePath: withHtml } satisfies Resolution;
    }
    return { kind: "not-found" } satisfies Resolution;
  });
}

export function bundleNotFoundFile(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
): Effect.Effect<string | null> {
  const candidate = resolveInside(path, root, "404.html");
  if (!candidate) return Effect.succeed(null);
  return kindOf(fs, candidate).pipe(Effect.map((kind) => (kind === "file" ? candidate : null)));
}

function decodePath(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
