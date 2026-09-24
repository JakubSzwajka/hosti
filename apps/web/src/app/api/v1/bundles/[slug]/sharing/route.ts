import { sharingBody } from "@hosti/bundles";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { errorResponse, failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { publicBaseUrl } from "@/server/config";
import { authenticatePush } from "@/use-cases/authenticate-push";
import { setBundleSharing } from "@/use-cases/set-sharing";
import { showBundle } from "@/use-cases/show-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function PUT(request: Request, context: Context): Promise<Response> {
  if (!(await runAppUseCase(authenticatePush(request.headers.get("authorization"))))) {
    return unauthorized();
  }
  const { slug } = await context.params;
  try {
    if (!(await runAppUseCase(showBundle(slug)))) return noSuchBundle(slug);

    const text = await request.text().catch(() => "");
    const body = text.trim() ? (JSON.parse(text) as { mode?: unknown; pin?: unknown }) : {};
    const fresh = await runAppUseCase(
      setBundleSharing({ slug, mode: body.mode, pin: body.pin, pinSource: "json" }),
    );
    if (!fresh) return noSuchBundle(slug);
    return jsonResponse(sharingBody(fresh, publicBaseUrl(request)));
  } catch (error) {
    return failureResponse(error);
  }
}

function noSuchBundle(slug: string): Response {
  return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
}
