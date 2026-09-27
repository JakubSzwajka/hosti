import {
  isUnlocked,
  lockedResponse,
  UNLOCK_PATH,
  unlockResponse,
  wantsPage,
} from "@/server/serving/gate";
import { hostiNotFound } from "@/server/serving/respond";
import { serveFromRevision } from "@/server/serving/serve-revision";
import { bundlesDir } from "@/server/config";
import { runCatalogSync, runServingSync, runStoragePromise } from "@/server/runtime";

const PREFIX = "/v/";

type ParsedRequest = { shareSlug: string; requestPath: string; sharePrefix: string };

function withNoStore(response: Response): Response {
  // A shared cache once kept serving a stale locked-link 404 after unlock.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

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
  if (!parsed) return withNoStore(hostiNotFound());

  const link = runCatalogSync((catalog) => catalog.resolveShare(parsed.shareSlug));
  const pinHash = link?.pinHash ?? null;
  const access = runServingSync((serving) =>
    serving.decideBundleAccess({
      shareExists: link !== null,
      pinProtected: pinHash !== null && pinHash.length > 0,
      unlocked:
        link !== null &&
        pinHash !== null &&
        pinHash.length > 0 &&
        isUnlocked(request, parsed.shareSlug, { bundleId: link.bundleId, pinHash }),
      canRenderGate: wantsPage(request),
    }),
  );
  if (access.kind === "not-found") return withNoStore(hostiNotFound());
  if (access.kind === "gate-required") return withNoStore(lockedResponse(request, parsed));
  if (!link) return withNoStore(hostiNotFound());

  const root = await runStoragePromise((storage) =>
    storage.currentRevisionRoot(bundlesDir(), link.bundleSlug),
  );
  if (!root) return withNoStore(hostiNotFound());

  return withNoStore(
    await serveFromRevision(request, root, {
      prefix: parsed.sharePrefix,
      requestPath: parsed.requestPath,
    }),
  );
}

export async function unlockBundleRequest(request: Request): Promise<Response> {
  const parsed = parseBundleUrl(request.url);
  if (!parsed || parsed.requestPath !== UNLOCK_PATH) return withNoStore(hostiNotFound());

  const link = runCatalogSync((catalog) => catalog.resolveShare(parsed.shareSlug));
  if (!link) return withNoStore(hostiNotFound());

  return withNoStore(
    await unlockResponse(request, parsed, { bundleId: link.bundleId, pinHash: link.pinHash }),
  );
}
