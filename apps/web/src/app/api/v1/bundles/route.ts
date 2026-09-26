import type { CatalogResponse } from "@hosti/shared";
import { failureResponse, jsonResponse } from "@/server/api-responses";
import { requirePushScope } from "@/app/_http/push-access";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { listCatalog } from "@/use-cases/list-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const access = await requirePushScope(request, "publish");
  if (!access.ok) return access.response;
  try {
    return jsonResponse({ bundles: await runAppUseCase(listCatalog()) } satisfies CatalogResponse);
  } catch (error) {
    return failureResponse(error);
  }
}
