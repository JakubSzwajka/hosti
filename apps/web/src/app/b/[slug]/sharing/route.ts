import { runAppUseCase } from "@/app/_http/run-use-case";
import { backTo, guardMutation } from "@/server/auth/admin";
import { PushError } from "@/server/errors";
import { setBundleSharing } from "@/use-cases/set-sharing";
import { showBundle } from "@/use-cases/show-bundle";
import { writerRoute } from "@/app/_http/writer-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function post(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;

  const { slug } = await context.params;
  if (!(await runAppUseCase(showBundle(slug)))) {
    return new Response("No such bundle", { status: 404 });
  }

  try {
    await runAppUseCase(
      setBundleSharing({
        slug,
        mode: form.get("mode"),
        pin: form.get("pin"),
        pinSource: "form",
      }),
    );
  } catch (error) {
    if (error instanceof PushError) return backTo(`/b/${slug}?share=${error.code}`);
    throw error;
  }
  return backTo(`/b/${slug}`);
}

export const POST = writerRoute(post);
