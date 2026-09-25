import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { contentTypeFor } from "@/server/serving/content-type";

function bundleCsp(frameAncestors: string): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
    "style-src 'self' 'unsafe-inline' data:",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}

export const BUNDLE_CSP = bundleCsp("'none'");

export const PREVIEW_CSP = bundleCsp("'self'");

export type ServeOptions = {
  status?: number;

  embeddable?: boolean;
};

export const HOSTI_PAGE_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

export function hostiPageHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Content-Security-Policy", HOSTI_PAGE_CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cache-Control", "no-store");
  return headers;
}

export function bundleHeaders(extra?: HeadersInit, options: ServeOptions = {}): Headers {
  const headers = new Headers(extra);
  headers.set("Content-Security-Policy", options.embeddable ? PREVIEW_CSP : BUNDLE_CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  // Bundle content stays same-origin; adding CORS would expose it elsewhere.
  return headers;
}

function etagFor(size: number, mtimeMs: number): string {
  return `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
}

export async function fileResponse(
  request: Request,
  root: string,
  absolutePath: string,
  options: ServeOptions = {},
): Promise<Response | null> {
  const status = options.status ?? 200;
  let real: string;
  try {
    real = await fs.realpath(absolutePath);
  } catch {
    return null;
  }
  if (real !== root && !real.startsWith(root + path.sep)) return null;

  const stat = await fs.stat(real).catch(() => null);
  if (!stat?.isFile()) return null;

  const etag = etagFor(stat.size, stat.mtimeMs);
  const headers = bundleHeaders(
    {
      "Content-Type": contentTypeFor(real),
      ETag: etag,
      "Last-Modified": stat.mtime.toUTCString(),
      "Cache-Control": "no-cache",
    },
    options,
  );

  if (matchesEtag(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }

  headers.set("Content-Length", String(stat.size));
  if (request.method === "HEAD") {
    return new Response(null, { status, headers });
  }
  const body = Readable.toWeb(createReadStream(real)) as ReadableStream<Uint8Array>;
  return new Response(body, { status, headers });
}

function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === etag || value === `W/${etag}` || value === "*");
}

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Not found</title>
    <style>
      body { font: 16px/1.6 ui-sans-serif, system-ui, sans-serif; margin: 20vh auto; max-width: 32rem;
             padding: 0 1.5rem; color: #2b3133; background: #ecf2f3; }
      code { background: #dee4e5; padding: 0.1rem 0.3rem; border-radius: 3px; }
    </style>
  </head>
  <body>
    <h1>Not found</h1>
    <p>There is nothing at this link. It may never have existed, or the bundle behind it
       has no revision yet.</p>
    <p><small>Hosti</small></p>
  </body>
</html>
`;

export function hostiNotFound(options: ServeOptions = {}): Response {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: bundleHeaders({ "Content-Type": "text/html; charset=utf-8" }, options),
  });
}

export function hostiPage(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: hostiPageHeaders({ "Content-Type": "text/html; charset=utf-8" }),
  });
}

export function bundleRedirect(location: string, options: ServeOptions = {}): Response {
  return new Response(null, {
    status: 308,
    headers: bundleHeaders({ Location: location }, options),
  });
}
