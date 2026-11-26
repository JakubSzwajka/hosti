import {
  admittedTransfer,
  verifyTransferRequest,
  transferFailure,
} from "@/app/_http/mcp-capability";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { dataDir } from "@/server/config";
import { PushError } from "@/server/errors";
import { mcpArchiveResponse } from "@/server/serving/mcp-archive";
import { readMcpTransfer } from "@/use-cases/read-mcp-transfer";
import { resolveMcpDownload } from "@/use-cases/resolve-mcp-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const { id } = await context.params;
    if (!verifyTransferRequest(request, "download", id))
      throw new PushError("not_found", "Transfer unavailable", 404);
    const grant = await runAppUseCase(readMcpTransfer(dataDir(), id, "download"));
    if (grant.input.kind !== "download" || !admittedTransfer(grant.input.subject)) {
      throw new PushError("not_found", "Transfer unavailable", 404);
    }
    const { slug, seq, identity } = grant.input;
    if (!(await runAppUseCase(resolveMcpDownload(slug, seq))))
      throw new PushError("not_found", "Revision unavailable", 404);
    const response = await mcpArchiveResponse(slug, seq, identity);
    if (!response) throw new PushError("not_found", "Revision unavailable", 404);
    return response;
  } catch (error) {
    return transferFailure(error);
  }
}

export function HEAD(): Response {
  return new Response(null, {
    status: 405,
    headers: { Allow: "GET", "Cache-Control": "no-store" },
  });
}
