/** Calling the route handlers the way a client does, without a live server. */
import { DELETE as DELETE_BUNDLE } from "@/app/api/v1/bundles/[slug]/route";
import { POST as PUSH } from "@/app/api/v1/bundles/[slug]/revisions/route";
import {
  GET as LIST_SHARES,
  POST as CREATE_SHARE,
} from "@/app/api/v1/bundles/[slug]/share-links/route";
import { DELETE as REVOKE_SHARE } from "@/app/api/v1/share-links/[shareSlug]/route";
import { GET as SERVE } from "@/app/v/[slug]/[[...path]]/route";

export const ORIGIN = "http://localhost:3000";

function auth(token: string): Headers {
  return new Headers({ Authorization: `Bearer ${token}` });
}

export function push(
  token: string,
  slug: string,
  body: Buffer,
  init: { title?: string; collection?: string } = {},
): Promise<Response> {
  const headers = auth(token);
  headers.set("Content-Type", "application/gzip");
  if (init.title) headers.set("X-Hosti-Title", init.title);
  if (init.collection) headers.set("X-Hosti-Collection", init.collection);
  const request = new Request(`${ORIGIN}/api/v1/bundles/${slug}/revisions`, {
    method: "POST",
    headers,
    body: new Uint8Array(body),
  });
  return PUSH(request, { params: Promise.resolve({ slug }) });
}

export function createShare(
  token: string,
  slug: string,
  options: { unlisted?: boolean } = {},
): Promise<Response> {
  const headers = auth(token);
  headers.set("Content-Type", "application/json");
  const request = new Request(`${ORIGIN}/api/v1/bundles/${slug}/share-links`, {
    method: "POST",
    headers,
    body: JSON.stringify(options),
  });
  return CREATE_SHARE(request, { params: Promise.resolve({ slug }) });
}

export function listShares(token: string, slug: string): Promise<Response> {
  const request = new Request(`${ORIGIN}/api/v1/bundles/${slug}/share-links`, {
    headers: auth(token),
  });
  return LIST_SHARES(request, { params: Promise.resolve({ slug }) });
}

export function revokeShare(token: string, shareSlug: string): Promise<Response> {
  const request = new Request(`${ORIGIN}/api/v1/share-links/${shareSlug}`, {
    method: "DELETE",
    headers: auth(token),
  });
  return REVOKE_SHARE(request, { params: Promise.resolve({ shareSlug }) });
}

export function removeBundle(token: string, slug: string): Promise<Response> {
  const request = new Request(`${ORIGIN}/api/v1/bundles/${slug}`, {
    method: "DELETE",
    headers: auth(token),
  });
  return DELETE_BUNDLE(request, { params: Promise.resolve({ slug }) });
}

export function serve(urlPath: string, headers?: HeadersInit): Promise<Response> {
  return SERVE(new Request(`${ORIGIN}${urlPath}`, { headers }));
}

/** Push a fixture and open it, the two-step walk most tests need. */
export async function pushAndShare(
  token: string,
  slug: string,
  body: Buffer,
  options: { unlisted?: boolean } = {},
): Promise<string> {
  const pushed = await push(token, slug, body);
  if (pushed.status !== 201) throw new Error(`push failed: ${await pushed.text()}`);
  const shared = await createShare(token, slug, options);
  if (shared.status !== 201) throw new Error(`share failed: ${await shared.text()}`);
  const body_ = (await shared.json()) as { link: { slug: string } };
  return body_.link.slug;
}
