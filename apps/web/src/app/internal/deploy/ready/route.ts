import { privateRoute } from "@/app/_http/private-channel";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { jsonResponse } from "@/server/api-responses";
import { readWriterReadiness } from "@/use-cases/read-writer-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = privateRoute(async (_request: Request): Promise<Response> => {
  const status = await runAppUseCase(readWriterReadiness());
  return jsonResponse(status, 200, { "Cache-Control": "no-store" });
});
