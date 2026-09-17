import { serveBundleRequest, unlockBundleRequest } from "@/server/serving/serve-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return serveBundleRequest(request);
}

export async function HEAD(request: Request): Promise<Response> {
  return serveBundleRequest(request);
}

/** The PIN gate posts here. Nothing else under `/v/` accepts a POST. */
export async function POST(request: Request): Promise<Response> {
  return unlockBundleRequest(request);
}
