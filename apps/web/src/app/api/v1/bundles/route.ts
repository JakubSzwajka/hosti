import type { CatalogResponse } from "@hosti/shared";
import { failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { listCatalog } from "@/server/catalog";
import { authenticatePush } from "@/server/push-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!authenticatePush(request)) return unauthorized();
  try {
    return jsonResponse({ bundles: listCatalog() } satisfies CatalogResponse);
  } catch (error) {
    return failureResponse(error);
  }
}
