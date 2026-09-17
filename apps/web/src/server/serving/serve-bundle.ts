import { resolveShareLink } from "@/server/catalog";
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
 */
export async function serveBundleRequest(request: Request): Promise<Response> {
  const parsed = parseBundleUrl(request.url);
  if (!parsed) return hostiNotFound();

  const link = resolveShareLink(parsed.shareSlug);
  if (!link) return hostiNotFound();

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

async function missing(request: Request, root: string): Promise<Response> {
  const own = await bundleNotFoundFile(root);
  if (own) {
    const response = await fileResponse(request, root, own, 404);
    if (response) return response;
  }
  return hostiNotFound();
}
