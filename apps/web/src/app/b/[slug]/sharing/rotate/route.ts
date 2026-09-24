import { runAppUseCase } from "@/app/_http/run-use-case";
import { backTo, guardMutation } from "@/server/auth/admin";
import { rotateShare } from "@/use-cases/rotate-share";
import { showBundle } from "@/use-cases/show-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
