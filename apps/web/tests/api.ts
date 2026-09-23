import type { SharingMode } from "@hosti/shared";
import { POST as PRUNE } from "@/app/api/v1/bundles/[slug]/prune/route";
import { DELETE as DELETE_BUNDLE, GET as GET_BUNDLE } from "@/app/api/v1/bundles/[slug]/route";
import { POST as PUSH } from "@/app/api/v1/bundles/[slug]/revisions/route";
import { POST as ROTATE } from "@/app/api/v1/bundles/[slug]/sharing/rotate/route";
import { PUT as SET_SHARING } from "@/app/api/v1/bundles/[slug]/sharing/route";
import { GET as SERVE, POST as UNLOCK } from "@/app/v/[slug]/[[...path]]/route";

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

export function setSharing(
  token: string,
  slug: string,
  body: { mode?: unknown; pin?: unknown },
): Promise<Response> {
  const headers = auth(token);
  headers.set("Content-Type", "application/json");
  const request = new Request(`${ORIGIN}/api/v1/bundles/${slug}/sharing`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  return SET_SHARING(request, { params: Promise.resolve({ slug }) });
}

export function rotateSharing(token: string, slug: string): Promise<Response> {
  const request = new Request(`${ORIGIN}/api/v1/bundles/${slug}/sharing/rotate`, {
    method: "POST",
    headers: auth(token),
  });
  return ROTATE(request, { params: Promise.resolve({ slug }) });
}

export function getBundle(token: string, slug: string): Promise<Response> {
  const request = new Request(`${ORIGIN}/api/v1/bundles/${slug}`, { headers: auth(token) });
  return GET_BUNDLE(request, { params: Promise.resolve({ slug }) });
}

export function prune(token: string, slug: string): Promise<Response> {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const request = new Request(`${ORIGIN}/api/v1/bundles/${slug}/prune`, {
    method: "POST",
    headers,
  });
  return PRUNE(request, { params: Promise.resolve({ slug }) });
}

export function removeBundle(token: string, slug: string): Promise<Response> {
  const request = new Request(`${ORIGIN}/api/v1/bundles/${slug}`, {
    method: "DELETE",
    headers: auth(token),
  });
  return DELETE_BUNDLE(request, { params: Promise.resolve({ slug }) });
}

export function serve(urlPath: string, headers?: HeadersInit): Promise<Response> {
  return SERVE(new Request(`${ORIGIN}${urlPath}`, headers === undefined ? {} : { headers }));
}

export function navigate(urlPath: string, headers: HeadersInit = {}): Promise<Response> {
  const merged = new Headers(headers);
  merged.set("accept", "text/html,application/xhtml+xml");
  merged.set("sec-fetch-mode", "navigate");
  return SERVE(new Request(`${ORIGIN}${urlPath}`, { headers: merged }));
}

export function unlock(
  shareSlug: string,
  fields: Record<string, string>,
  headers: HeadersInit = {},
): Promise<Response> {
  const merged = new Headers(headers);
  merged.set("content-type", "application/x-www-form-urlencoded");
  return UNLOCK(
    new Request(`${ORIGIN}/v/${shareSlug}/unlock`, {
      method: "POST",
      headers: merged,
      body: new URLSearchParams(fields),
    }),
  );
}

export async function shareSlugOf(response: Response): Promise<string> {
  const body = (await response.json()) as
    | { sharing: { shareSlug: string } }
    | { bundle: { sharing: { shareSlug: string } } };
  return "sharing" in body ? body.sharing.shareSlug : body.bundle.sharing.shareSlug;
}

export async function pushAndShare(
  token: string,
  slug: string,
  body: Buffer,
  options: { mode?: SharingMode; pin?: string } = {},
): Promise<string> {
  const pushed = await push(token, slug, body);
  if (pushed.status !== 201) throw new Error(`push failed: ${await pushed.text()}`);
  const mode = options.mode ?? (options.pin ? "pin" : "link");
  const shared = await setSharing(token, slug, {
    mode,
    ...(options.pin ? { pin: options.pin } : {}),
  });
  if (shared.status !== 200) throw new Error(`sharing failed: ${await shared.text()}`);
  return shareSlugOf(shared);
}
