import type { WhoamiResponse } from "@hosti/shared";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { jsonResponse, unauthorized } from "@/server/api-responses";
import { authenticatePush } from "@/use-cases/authenticate-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const identity = await runAppUseCase(authenticatePush(request.headers.get("authorization")));
  if (!identity) return unauthorized();
  return jsonResponse({ name: identity.name, scopes: identity.scopes } satisfies WhoamiResponse);
}
