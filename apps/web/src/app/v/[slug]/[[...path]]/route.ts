import { serveBundleRequest, unlockBundleRequest } from "@/server/serving/serve-bundle";
import { writerRoute } from "@/app/_http/writer-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return serveBundleRequest(request);
}

export async function HEAD(request: Request): Promise<Response> {
  return serveBundleRequest(request);
}

async function post(request: Request): Promise<Response> {
  return unlockBundleRequest(request);
}

export const POST = writerRoute(post);
