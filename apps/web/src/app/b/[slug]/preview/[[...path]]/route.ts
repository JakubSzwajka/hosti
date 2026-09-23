import { servePreviewRequest } from "@/server/serving/serve-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return servePreviewRequest(request);
}

export function HEAD(request: Request): Promise<Response> {
  return servePreviewRequest(request);
}
