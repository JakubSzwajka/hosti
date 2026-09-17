import { servePreviewRequest } from "@/server/serving/serve-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The owner's preview of a bundle. GET and HEAD only; nothing here writes. */
export function GET(request: Request): Promise<Response> {
  return servePreviewRequest(request);
}

export function HEAD(request: Request): Promise<Response> {
  return servePreviewRequest(request);
}
