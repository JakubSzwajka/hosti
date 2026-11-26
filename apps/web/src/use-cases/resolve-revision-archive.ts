import { BundlesError } from "@hosti/bundles";
import { Catalog } from "@hosti/catalog";
import { Effect } from "effect";

export const resolveRevisionArchive = Effect.fn("resolveRevisionArchive")(function* (
  slug: string,
  requested: string,
) {
  const catalog = yield* Catalog;
  const bundle = yield* catalog.findBundle(slug);
  if (!bundle) return null;

  const revisions = yield* catalog.listRevisions(bundle.id);
  const kept = revisions.map((revision) => revision.seq);
  if (requested !== "current" && !/^[1-9]\d*$/.test(requested)) {
    return yield* new BundlesError({
      code: "bad_revision",
      message: "Revision must be current or a positive safe integer",
      status: 400,
    });
  }

  const seq =
    requested === "current"
      ? revisions.find((revision) => revision.current)?.seq
      : Number(requested);
  if (seq !== undefined && !Number.isSafeInteger(seq)) {
    return yield* new BundlesError({
      code: "bad_revision",
      message: "Revision must be current or a positive safe integer",
      status: 400,
    });
  }
  return { seq, kept };
});
