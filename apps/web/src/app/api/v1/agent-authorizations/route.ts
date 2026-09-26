import type { AgentAuthorizationCreatedResponse } from "@hosti/shared";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { errorResponse, failureResponse, jsonResponse } from "@/server/api-responses";
import { publicBaseUrl } from "@/server/config";
import { createAgentConnection } from "@/use-cases/create-agent-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;

export async function POST(request: Request): Promise<Response> {
  // No credential: only digests arrive, and nothing is usable until the owner approves.
  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse(
      "bad_request",
      "Send a JSON object with tokenName, tokenDigest, pollingDigest and scopes",
      400,
    );
  }
  try {
    const created = await runAppUseCase(
      createAgentConnection({
        tokenName: body.tokenName,
        tokenDigest: body.tokenDigest,
        pollingDigest: body.pollingDigest,
        scopes: body.scopes,
      }),
    );
    return jsonResponse(
      {
        id: created.id,
        userCode: created.userCode,
        approvalUrl: `${publicBaseUrl(request)}/connect/${created.id}`,
        expiresAt: created.expiresAt,
        pollAfterSeconds: created.pollAfterSeconds,
      } satisfies AgentAuthorizationCreatedResponse,
      201,
    );
  } catch (error) {
    return failureResponse(error);
  }
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => "");
  if (!text.trim() || text.length > MAX_BODY_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
