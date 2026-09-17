import { CatalogScreen, EmptyCollection } from "@/app/_ui/catalog-screen";
import { NO_COLLECTION, plural } from "@/app/_ui/format";
import { collectionChips } from "@/app/_ui/pieces";
import { requireAdmin } from "@/server/auth/admin";
import { listCatalog } from "@/server/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collection: string }>;
}) {
  const admin = await requireAdmin();
  const { collection } = await params;
  const wanted = decodeURIComponent(collection);
  const loose = wanted === NO_COLLECTION;
  const all = listCatalog();
  const bundles = all.filter((bundle) =>
    loose ? bundle.collection === null : bundle.collection === wanted,
  );
  const name = loose ? "no collection" : wanted;

  return (
    <CatalogScreen
      bundles={bundles}
      chips={collectionChips(all)}
      active={`/c/${encodeURIComponent(collection)}`}
      token={admin.mutationToken}
      heading={`${name} \u00b7 ${plural(bundles.length, "bundle")} \u00b7 newest first`}
      lead={
        loose ? (
          <>
            Bundles no push put in a collection. A collection is flat and a bundle sits in{" "}
            <strong>zero or one</strong> of them.
          </>
        ) : (
          <>
            Bundles pushed into <strong>{wanted}</strong>. A collection is flat, never a tree.
          </>
        )
      }
      emptyNote={<EmptyCollection name={name} />}
    />
  );
}
