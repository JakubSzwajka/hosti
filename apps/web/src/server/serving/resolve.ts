import { ENTRY_FILE } from "@hosti/shared";
import fs from "node:fs/promises";
import { resolveInside } from "@/server/storage/paths";

export type Resolution =
  | { kind: "redirect"; to: string }
  | { kind: "file"; absolutePath: string }
  | { kind: "not-found" };

type Kind = "file" | "directory" | null;

async function kindOf(absolutePath: string): Promise<Kind> {
  try {
    const stat = await fs.stat(absolutePath);
    if (stat.isFile()) return "file";
    if (stat.isDirectory()) return "directory";
    return null;
  } catch {
    return null;
  }
}

/**
 * Turn a request under /v/<share-slug> into a file, a redirect or a miss.
 *
 *   /v/x                  308 /v/x/
 *   /v/x/                 index.html
 *   /v/x/athletes/        athletes/index.html
 *   /v/x/athletes         308 /v/x/athletes/        (it is a directory)
 *   /v/x/reports/2026-q3  reports/2026-q3.html      (retry with .html)
 *   /v/x/assets/chart.js  the file
 *
 * `requestPath` is everything after the share slug, so "" or "/" or "/a/b".
 */
export async function resolveBundleRequest(
  root: string,
  sharePrefix: string,
  requestPath: string,
): Promise<Resolution> {
  if (requestPath === "") {
    return { kind: "redirect", to: `${sharePrefix}/` };
  }

  const relative = decodePath(requestPath.replace(/^\/+/, ""));
  if (relative === null) return { kind: "not-found" };

  const wantsDirectory = requestPath.endsWith("/");
  const target = resolveInside(root, relative);
  if (!target) return { kind: "not-found" };

  if (wantsDirectory) {
    const index = resolveInside(root, `${relative}${ENTRY_FILE}`);
    if (index && (await kindOf(index)) === "file") {
      return { kind: "file", absolutePath: index };
    }
    return { kind: "not-found" };
  }

  const direct = await kindOf(target);
  if (direct === "file") return { kind: "file", absolutePath: target };
  if (direct === "directory") {
    return { kind: "redirect", to: `${sharePrefix}${requestPath}/` };
  }

  const withHtml = resolveInside(root, `${relative}.html`);
  if (withHtml && (await kindOf(withHtml)) === "file") {
    return { kind: "file", absolutePath: withHtml };
  }
  return { kind: "not-found" };
}

/** The bundle's own 404.html, when it has one. */
export async function bundleNotFoundFile(root: string): Promise<string | null> {
  const candidate = resolveInside(root, "404.html");
  if (candidate && (await kindOf(candidate)) === "file") return candidate;
  return null;
}

function decodePath(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
