import { privateRoute } from "@/app/_http/private-channel";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { jsonResponse } from "@/server/api-responses";
import { runDeploySmoke } from "@/use-cases/run-deploy-smoke";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = privateRoute(async (_request: Request): Promise<Response> => {
  const smoke = await runAppUseCase(runDeploySmoke());
  return jsonResponse(smoke, smoke.ok ? 200 : 503, { "Cache-Control": "no-store" });
});
