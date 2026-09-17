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

/** Revisions kept per bundle when nothing says otherwise. */
export const DEFAULT_KEEP_REVISIONS = 5;

/**
 * How many revisions of one bundle survive a push. Old pushes are the whole
 * reason a disk fills up, and nobody rolls back to the twentieth one.
 *
 * A number below 1 is read as 1: keeping zero revisions would mean deleting
 * the one that is live. Anything unparseable falls back to the default rather
 * than turning pruning off by accident, because a typo that silently keeps
 * everything is the failure this exists to prevent.
 */
export function keepRevisions(): number {
  const raw = process.env.HOSTI_KEEP_REVISIONS?.trim();
  if (!raw) return DEFAULT_KEEP_REVISIONS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed)) return DEFAULT_KEEP_REVISIONS;
  return Math.max(1, parsed);
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
