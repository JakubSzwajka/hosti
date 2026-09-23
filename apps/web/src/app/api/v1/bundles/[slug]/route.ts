import type { BundleResponse, DeletedBundleResponse } from "@hosti/shared";
import { errorResponse, failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { describeBundle, findBundle } from "@/server/catalog";
import { publicBaseUrl } from "@/server/config";
import { authenticatePush } from "@/server/push-tokens";
import { removeBundle } from "@/server/remove-bundle";
import { shareUrl } from "@/server/sharing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  if (!authenticatePush(request)) return unauthorized();
  const { slug } = await context.params;
  try {
    const row = findBundle(slug);
    if (!row) return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
    const bundle = describeBundle(row);
    return jsonResponse({
      bundle,
      shareUrl: shareUrl(bundle.sharing, publicBaseUrl(request)),
    } satisfies BundleResponse);
  } catch (error) {
    return failureResponse(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  if (!authenticatePush(request)) return unauthorized();
  const { slug } = await context.params;
  try {
    if (!(await removeBundle(slug))) {
      return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
    }
    return jsonResponse({ bundle: slug, deleted: true } satisfies DeletedBundleResponse);
  } catch (error) {
    return failureResponse(error);
  }
}
