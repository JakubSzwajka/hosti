import { isValidSlug } from "@hosti/shared";
import { adminSecrets, signingSecret } from "@/server/auth/config";
import { readCookie } from "@/server/auth/cookie";
import { SESSION_COOKIE, verifySession } from "@/server/auth/session";
import { findBundle } from "@/server/catalog";
import { TOKEN_MARK, verifyPreviewToken } from "@/server/serving/preview-token";
import { hostiNotFound } from "@/server/serving/respond";
import { serveFromRevision } from "@/server/serving/serve-revision";
import { currentRevisionRoot } from "@/server/storage/paths";

export const PREVIEW_SEGMENT = "preview";

type ParsedPreview = {
  bundleSlug: string;
  requestPath: string;
  prefix: string;

  token: string | null;
};

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

export function hasAdminSession(request: Request): boolean {
  const secrets = adminSecrets();
  if (!secrets) return false;
  return verifySession(secrets.secret, readCookie(request.headers, SESSION_COOKIE)) !== null;
}

function mayPreview(request: Request, parsed: ParsedPreview): boolean {
  if (hasAdminSession(request)) return true;
  const secret = signingSecret();
  if (!secret) return false;
  return verifyPreviewToken(secret, parsed.bundleSlug, parsed.token);
}

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
