import { Catalog } from "@hosti/catalog";
import { Effect } from "effect";

export const resolveMcpDownload = Effect.fn("resolveMcpDownload")(function* (
  slug: string,
  seq: number,
) {
  const catalog = yield* Catalog;
  const bundle = yield* catalog.findBundle(slug);
  if (!bundle) return false;
  const revisions = yield* catalog.listRevisions(bundle.id);
  return revisions.some((revision) => revision.seq === seq);
});
