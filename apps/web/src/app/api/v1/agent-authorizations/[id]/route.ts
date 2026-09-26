import type { AgentAuthorizationStatusResponse } from "@hosti/shared";
import { CONNECTION_ID_PATTERN } from "@hosti/identity";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { jsonResponse, noSuchConnection } from "@/server/api-responses";
import { pollAgentConnection } from "@/use-cases/poll-agent-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  if (!CONNECTION_ID_PATTERN.test(id)) return noSuchConnection();
  const status = await runAppUseCase(pollAgentConnection(id, request.headers.get("authorization")));
  if (!status) return noSuchConnection();
  return jsonResponse(status satisfies AgentAuthorizationStatusResponse, 200, {
    "Cache-Control": "no-store",
  });
}
