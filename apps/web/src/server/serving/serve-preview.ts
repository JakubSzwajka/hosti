import { isValidSlug } from "@hosti/shared";
import { adminSecrets, signingSecret } from "@/server/auth/config";
import { readCookie } from "@/server/auth/cookie";
import { SESSION_COOKIE, verifySession } from "@/server/auth/session";
import { findBundle } from "@/server/catalog";
import { TOKEN_MARK, verifyPreviewToken } from "@/server/serving/preview-token";
import { hostiNotFound } from "@/server/serving/respond";
import { serveFromRevision } from "@/server/serving/serve-revision";
import { currentRevisionRoot } from "@/server/storage/paths";

/**
 * The owner's own path onto a bundle: `/b/<slug>/preview/`, serving the same
 * bytes `/v/` would serve.
 *
 * It exists because most bundles have no share link at all, so the catalog
 * cannot point a preview frame at `/v/`. Two things open it and nothing else:
 * the admin session cookie, and a signed preview token in the path. A push
 * token never does, because this module reads no `Authorization` header, and a
 * PIN cookie never does, because it is scoped to a `/v/` path.
 *
 * The catalog frames the answer, so these responses carry
 * `frame-ancestors 'self'`. The frame itself is sandboxed without
 * `allow-same-origin`, which is what keeps a bundle's script from reading the
 * owner's cookie back out, and what makes the token necessary. See
 * `preview-token.ts` for that trade.
 */

export const PREVIEW_SEGMENT = "preview";

type ParsedPreview = {
  bundleSlug: string;
  requestPath: string;
  prefix: string;
  /** The grant from the path, when the URL carried one. */
  token: string | null;
};

/**
 * Split `/b/<slug>/preview/<path>` without losing the trailing slash. A first
 * segment starting with `~` is the grant, not a file: bundle paths never start
 * one that way, so the two can never be confused.
 */
export function parsePreviewUrl(url: string): ParsedPreview | null {
  const pathname = new URL(url).pathname;
  const match = /^\/b\/([^/]+)\/preview(\/.*)?$/.exec(pathname);
  if (!match) return null;
  const rawSlug = match[1] as string;
  let bundleSlug: string;
  try {
    bundleSlug = decodeURIComponent(rawSlug);
  } catch {
    return null;
  }
  if (!isValidSlug(bundleSlug)) return null;

  let requestPath = match[2] ?? "";
  let prefix = `/b/${rawSlug}/${PREVIEW_SEGMENT}`;
  let token: string | null = null;

  const cut = requestPath.indexOf("/", 1);
  const first = cut === -1 ? requestPath.slice(1) : requestPath.slice(1, cut);
  if (first.startsWith(TOKEN_MARK)) {
    token = decodeURIComponent(first.slice(TOKEN_MARK.length));
    prefix = `${prefix}/${first}`;
    requestPath = cut === -1 ? "" : requestPath.slice(cut);
  }

  return { bundleSlug, requestPath, prefix, token };
}

/**
 * Is this request carrying a live admin session? Read straight off the
 * request rather than through `next/headers`, so the check is the same one
 * every catalog mutation makes and a test can call it with a plain Request.
 */
export function hasAdminSession(request: Request): boolean {
  const secrets = adminSecrets();
  if (!secrets) return false;
  return verifySession(secrets.secret, readCookie(request.headers, SESSION_COOKIE)) !== null;
}

/** The owner, either by the cookie they hold or by the grant in the path. */
function mayPreview(request: Request, parsed: ParsedPreview): boolean {
  if (hasAdminSession(request)) return true;
  const secret = signingSecret();
  if (!secret) return false;
  return verifyPreviewToken(secret, parsed.bundleSlug, parsed.token);
}

/**
 * Serve one file of a bundle's current revision to the logged-in owner.
 * Everyone else gets the same 404 an unknown bundle gets, so the route tells a
 * prober no more than `/v/` does.
 */
export async function servePreviewRequest(request: Request): Promise<Response> {
  const parsed = parsePreviewUrl(request.url);
  if (!parsed) return hostiNotFound();
  if (!mayPreview(request, parsed)) return hostiNotFound();

  const bundle = findBundle(parsed.bundleSlug);
  if (!bundle) return hostiNotFound();

  const root = await currentRevisionRoot(bundle.slug);
  if (!root) return hostiNotFound();

  return serveFromRevision(
    request,
    root,
    { prefix: parsed.prefix, requestPath: parsed.requestPath },
    { embeddable: true },
  );
}
