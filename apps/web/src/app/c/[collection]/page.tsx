import { CatalogScreen, EmptyCollection } from "@/app/_ui/catalog-screen";
import { collectionChips, NO_COLLECTION } from "@/app/_ui/format";
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
      allSlugs={all.map((bundle) => bundle.slug)}
      {...(loose ? {} : { collection: wanted })}
      {...(bundles.length === 0 ? {} : { heading: "newest first" })}
      emptyNote={<EmptyCollection name={name} />}
    />
  );
}
