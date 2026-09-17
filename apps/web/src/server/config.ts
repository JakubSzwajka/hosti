import path from "node:path";

/**
 * Where bundles and the SQLite file live. `./data` while developing, `/data`
 * in the container (the Dockerfile sets HOSTI_DATA_DIR).
 */
export function dataDir(): string {
  return path.resolve(process.env.HOSTI_DATA_DIR ?? "./data");
}

export function bundlesDir(): string {
  return path.join(dataDir(), "bundles");
}

export function databaseFile(): string {
  return path.join(dataDir(), "hosti.db");
}

/**
 * The origin Hosti prints in push responses. HOSTI_PUBLIC_URL wins, because
 * behind Caddy the request the app sees is plain http on an internal name.
 */
export function publicBaseUrl(request: Request): string {
  const configured = process.env.HOSTI_PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

/**
 * The same origin for a server component, which has headers but no Request.
 * Falls back to the dev address when a proxy strips the host header.
 */
export function baseUrlFromHeaders(headers: Headers): string {
  const configured = process.env.HOSTI_PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  return `${proto}://${host}`;
}
