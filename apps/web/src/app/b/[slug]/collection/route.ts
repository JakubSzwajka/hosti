import { readCollection } from "@hosti/shared";
import { backTo, guardMutation } from "@/server/auth/admin";
import { findBundle, setBundleCollection } from "@/server/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Put this bundle in a collection, move it to another, or take it out of every
 * one. A collection is a flat label, so all three are the same write.
 *
 * Cookie plus mutation token, like every other change the catalog makes. A
 * push may still set a collection through its header; this is the only way to
 * clear one.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;

  const { slug } = await context.params;
  const bundle = findBundle(slug);
  if (!bundle) return new Response("No such bundle", { status: 404 });

  const typed = form.get("collection");
  if (typed === "__new") return backTo(`/b/${slug}?collection=new`);

  const clearing = form.get("clear") === "1";
  const wanted = clearing ? null : readCollection(typeof typed === "string" ? typed : "");
  if (wanted === undefined) {
    return backTo(`/b/${slug}?collection=bad_collection`);
  }

  setBundleCollection(bundle.id, wanted);
  return backTo(`/b/${slug}`);
}
