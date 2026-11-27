import { runAppUseCase } from "@/app/_http/run-use-case";
import { backTo, guardMutation } from "@/server/auth/admin";
import { rotateShare } from "@/use-cases/rotate-share";
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

  await runAppUseCase(rotateShare(slug));
  return backTo(`/b/${slug}`);
}

export const POST = writerRoute(post);
