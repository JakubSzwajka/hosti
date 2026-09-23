import { resolveShare } from "@/server/catalog";
import { isUnlocked, lockedResponse, UNLOCK_PATH, unlockResponse } from "@/server/serving/gate";
import { hostiNotFound } from "@/server/serving/respond";
import { serveFromRevision } from "@/server/serving/serve-revision";
import { currentRevisionRoot } from "@/server/storage/paths";

const PREFIX = "/v/";

type ParsedRequest = { shareSlug: string; requestPath: string; sharePrefix: string };

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

export async function serveBundleRequest(request: Request): Promise<Response> {
  const parsed = parseBundleUrl(request.url);
  if (!parsed) return hostiNotFound();

  // Resolve sharing before disk access so unknown and private links share one 404.
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

export async function unlockBundleRequest(request: Request): Promise<Response> {
  const parsed = parseBundleUrl(request.url);
  if (!parsed || parsed.requestPath !== UNLOCK_PATH) return hostiNotFound();

  const link = resolveShare(parsed.shareSlug);
  if (!link) return hostiNotFound();

  return unlockResponse(request, parsed, { bundleId: link.bundleId, pinHash: link.pinHash });
}
