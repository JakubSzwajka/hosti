import { sharingBody } from "@hosti/bundles";
import { requirePushScope } from "@/app/_http/push-access";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { errorResponse, failureResponse, jsonResponse } from "@/server/api-responses";
import { publicBaseUrl } from "@/server/config";
import { rotateShare } from "@/use-cases/rotate-share";
import { showBundle } from "@/use-cases/show-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const access = await requirePushScope(request, "share");
  if (!access.ok) return access.response;
  const { slug } = await context.params;
  try {
    if (!(await runAppUseCase(showBundle(slug)))) {
      return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
    }
    const fresh = await runAppUseCase(rotateShare(slug));
    if (!fresh) return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
    return jsonResponse(sharingBody(fresh, publicBaseUrl(request)));
  } catch (error) {
    return failureResponse(error);
  }
}
