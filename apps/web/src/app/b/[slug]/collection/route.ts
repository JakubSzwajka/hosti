import { readCollection } from "@hosti/shared";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { backTo, guardMutation } from "@/server/auth/admin";
import { setCollection } from "@/use-cases/set-collection";
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

  const typed = form.get("collection");
  if (typed === "__new") return backTo(`/b/${slug}?collection=new`);

  const clearing = form.get("clear") === "1";
  const wanted = clearing ? null : readCollection(typeof typed === "string" ? typed : "");
  if (wanted === undefined) {
    return backTo(`/b/${slug}?collection=bad_collection`);
  }

  await runAppUseCase(setCollection(slug, wanted));
  return backTo(`/b/${slug}`);
}
