import { resolveShare } from "@/server/catalog";
import { isUnlocked, lockedResponse, UNLOCK_PATH, unlockResponse } from "@/server/serving/gate";
import { hostiNotFound } from "@/server/serving/respond";
import { serveFromRevision } from "@/server/serving/serve-revision";
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
 * Serve one file out of the bundle's current revision. An unknown share slug,
 * a private bundle and a bundle without a revision answer the same 404, so a
 * guess tells the guesser nothing.
 *
 * A pin is checked before the revision is even looked up, so a locked link
 * gives away nothing about the state of what sits behind it. That is also why
 * the bundle's own `404.html` cannot reach a guest here: a locked or a private
 * bundle never gets past this point, so its 404 page answers only on a link
 * the bundle would have answered on anyway.
 */
export async function serveBundleRequest(request: Request): Promise<Response> {
  const parsed = parseBundleUrl(request.url);
  if (!parsed) return hostiNotFound();

  const link = resolveShare(parsed.shareSlug);
  if (!link) return hostiNotFound();

  const pinHash = link.pinHash;
  if (pinHash && !isUnlocked(request, parsed.shareSlug, { bundleId: link.bundleId, pinHash })) {
    return lockedResponse(request, parsed);
  }

  const root = await currentRevisionRoot(link.bundleSlug);
  if (!root) return hostiNotFound();

  return serveFromRevision(request, root, {
    prefix: parsed.sharePrefix,
    requestPath: parsed.requestPath,
  });
}

/**
 * `POST /v/<share-slug>/unlock` and nothing else. Every other POST under `/v/`
 * gets the plain 404, because a bundle is static files and has nothing to take.
 * A bundle file named `unlock` is still served on GET; only POST is claimed.
 */
export async function unlockBundleRequest(request: Request): Promise<Response> {
  const parsed = parseBundleUrl(request.url);
  if (!parsed || parsed.requestPath !== UNLOCK_PATH) return hostiNotFound();

  const link = resolveShare(parsed.shareSlug);
  if (!link) return hostiNotFound();

  return unlockResponse(request, parsed, { bundleId: link.bundleId, pinHash: link.pinHash });
}
