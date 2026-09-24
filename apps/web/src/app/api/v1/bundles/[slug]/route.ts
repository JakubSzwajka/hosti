import type { BundleResponse, DeletedBundleResponse } from "@hosti/shared";
import { shareUrl } from "@hosti/bundles";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { errorResponse, failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { bundlesDir, publicBaseUrl } from "@/server/config";
import { authenticatePush } from "@/use-cases/authenticate-push";
import { deleteBundle } from "@/use-cases/delete-bundle";
import { showBundle } from "@/use-cases/show-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  if (!(await runAppUseCase(authenticatePush(request.headers.get("authorization"))))) {
    return unauthorized();
  }
  const { slug } = await context.params;
  try {
    const shown = await runAppUseCase(showBundle(slug));
    if (!shown) return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
    const bundle = shown.bundle;
    return jsonResponse({
      bundle,
      shareUrl: shareUrl(bundle.sharing, publicBaseUrl(request)),
    } satisfies BundleResponse);
  } catch (error) {
    return failureResponse(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  if (!(await runAppUseCase(authenticatePush(request.headers.get("authorization"))))) {
    return unauthorized();
  }
  const { slug } = await context.params;
  try {
    if (!(await runAppUseCase(deleteBundle({ slug, bundlesRoot: bundlesDir() })))) {
      return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
    }
    return jsonResponse({ bundle: slug, deleted: true } satisfies DeletedBundleResponse);
  } catch (error) {
    return failureResponse(error);
  }
}
