import type { CatalogResponse } from "@hosti/shared";
import { failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { authenticatePush } from "@/use-cases/authenticate-push";
import { listCatalog } from "@/use-cases/list-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!(await runAppUseCase(authenticatePush(request.headers.get("authorization"))))) {
    return unauthorized();
  }
  try {
    return jsonResponse({ bundles: await runAppUseCase(listCatalog()) } satisfies CatalogResponse);
  } catch (error) {
    return failureResponse(error);
  }
}
