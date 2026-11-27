import { readFenceEpoch } from "@/app/_http/deploy-epoch";
import { privateRoute } from "@/app/_http/private-channel";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { errorResponse, failureResponse, jsonResponse } from "@/server/api-responses";
import { fenceWriter } from "@/use-cases/fence-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = privateRoute(async (request: Request): Promise<Response> => {
  const epoch = await readFenceEpoch(request);
  if (epoch === null) {
    return errorResponse("invalid_epoch", "Header and body must carry the same epoch", 400);
  }
  try {
    return jsonResponse(await runAppUseCase(fenceWriter(epoch)), 200, {
      "Cache-Control": "no-store",
    });
  } catch (error) {
    return failureResponse(error);
  }
});
