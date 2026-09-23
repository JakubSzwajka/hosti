import path from "node:path";

export function dataDir(): string {
  return path.resolve(process.env.HOSTI_DATA_DIR ?? "./data");
}

export function bundlesDir(): string {
  return path.join(dataDir(), "bundles");
}

export function databaseFile(): string {
  return path.join(dataDir(), "hosti.db");
}

export const DEFAULT_KEEP_REVISIONS = 5;

export function keepRevisions(): number {
  const raw = process.env.HOSTI_KEEP_REVISIONS?.trim();
  if (!raw) return DEFAULT_KEEP_REVISIONS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed)) return DEFAULT_KEEP_REVISIONS;
  return Math.max(1, parsed);
}

export function publicBaseUrl(request: Request): string {
  const configured = process.env.HOSTI_PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

export function baseUrlFromHeaders(headers: Headers): string {
  const configured = process.env.HOSTI_PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  return `${proto}://${host}`;
}
