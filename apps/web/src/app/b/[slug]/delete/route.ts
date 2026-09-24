import { runAppUseCase } from "@/app/_http/run-use-case";
import { backTo, guardMutation } from "@/server/auth/admin";
import { bundlesDir } from "@/server/config";
import { deleteBundle } from "@/use-cases/delete-bundle";

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
  const gone = await runAppUseCase(deleteBundle({ slug, bundlesRoot: bundlesDir() }));
  if (!gone) return new Response("No such bundle", { status: 404 });
  return backTo("/");
}
