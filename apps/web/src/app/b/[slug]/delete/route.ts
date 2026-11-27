import { runAppUseCase } from "@/app/_http/run-use-case";
import { backTo, guardMutation } from "@/server/auth/admin";
import { bundlesDir } from "@/server/config";
import { deleteBundle } from "@/use-cases/delete-bundle";
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
  const gone = await runAppUseCase(deleteBundle({ slug, bundlesRoot: bundlesDir() }));
  if (!gone) return new Response("No such bundle", { status: 404 });
  return backTo("/");
}

export const POST = writerRoute(post);
