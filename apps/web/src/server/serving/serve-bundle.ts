import { resolveShareLink } from "@/server/catalog";
import { isUnlocked, lockedResponse, UNLOCK_PATH, unlockResponse } from "@/server/serving/gate";
import { bundleNotFoundFile, resolveBundleRequest } from "@/server/serving/resolve";
import { bundleRedirect, fileResponse, hostiNotFound } from "@/server/serving/respond";
import { currentRevisionRoot } from "@/server/storage/paths";

const PREFIX = "/v/";

type ParsedRequest = { shareSlug: string; requestPath: string; sharePrefix: string };

/** Split `/v/<share-slug>/<path>` without losing the trailing slash. */
export function parseBundleUrl(url: string): ParsedRequest | null {
  const pathname = new URL(url).pathname;
  if (!pathname.startsWith(PREFIX)) return null;
  const rest = pathname.slice(PREFIX.length);
  const cut = rest.indexOf("/");
  const rawSlug = cut === -1 ? rest : rest.slice(0, cut);
  if (!rawSlug) return null;
  let shareSlug: string;
  try {
    shareSlug = decodeURIComponent(rawSlug);
  } catch {
    return null;
  }
  return {
    shareSlug,
    requestPath: cut === -1 ? "" : rest.slice(cut),
    sharePrefix: PREFIX + rawSlug,
  };
}

/**
 * Serve one file out of a share link's current revision. An unknown share slug
 * and a bundle without a revision answer the same 404, so a guess tells the
 * guesser nothing.
 *
 * A PIN on the link is checked before the revision is even looked up, so a
 * locked link gives away nothing about the state of what sits behind it.
 */
export async function serveBundleRequest(request: Request): Promise<Response> {
  const parsed = parseBundleUrl(request.url);
  if (!parsed) return hostiNotFound();

  const link = resolveShareLink(parsed.shareSlug);
  if (!link) return hostiNotFound();

  if (link.pinHash && !isUnlocked(request, parsed.shareSlug)) {
    return lockedResponse(request, parsed);
  }

  const root = await currentRevisionRoot(link.bundleSlug);
  if (!root) return hostiNotFound();

  const search = new URL(request.url).search;
  const resolution = await resolveBundleRequest(root, parsed.sharePrefix, parsed.requestPath);

  if (resolution.kind === "redirect") {
    return bundleRedirect(resolution.to + search);
  }
  if (resolution.kind === "file") {
    const response = await fileResponse(request, root, resolution.absolutePath);
    if (response) return response;
  }
  return missing(request, root);
}

/**
 * `POST /v/<share-slug>/unlock` and nothing else. Every other POST under `/v/`
 * gets the plain 404, because a bundle is static files and has nothing to take.
 * A bundle file named `unlock` is still served on GET; only POST is claimed.
 */
export async function unlockBundleRequest(request: Request): Promise<Response> {
  const parsed = parseBundleUrl(request.url);
  if (!parsed || parsed.requestPath !== UNLOCK_PATH) return hostiNotFound();

  const link = resolveShareLink(parsed.shareSlug);
  if (!link) return hostiNotFound();

  return unlockResponse(request, parsed, link.pinHash);
}

async function missing(request: Request, root: string): Promise<Response> {
  const own = await bundleNotFoundFile(root);
  if (own) {
    const response = await fileResponse(request, root, own, 404);
    if (response) return response;
  }
  return hostiNotFound();
}
