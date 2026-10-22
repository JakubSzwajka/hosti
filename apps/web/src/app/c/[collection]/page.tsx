import type { PreviewGrant } from "@hosti/serving";
import { CatalogScreen, EmptyCollection, parseView } from "@/app/_ui/catalog-screen";
import { collectionChips, NO_COLLECTION } from "@/app/_ui/format";
import { previewGrants } from "@/app/_http/preview-grants";
import { requireAdmin } from "@/server/auth/admin";
import { listCatalog } from "@/use-cases/list-catalog";
import { runAppUseCase } from "@/app/_http/run-use-case";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ collection: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const view = parseView((await searchParams).view);
  const admin = await requireAdmin();
  const { collection } = await params;
  const wanted = decodeURIComponent(collection);
  const loose = wanted === NO_COLLECTION;
  const all = await runAppUseCase(listCatalog());
  const bundles = all.filter((bundle) =>
    loose ? bundle.collection === null : bundle.collection === wanted,
  );
  const name = loose ? "no collection" : wanted;
  const grants = view === "table" ? new Map<string, PreviewGrant>() : await previewGrants(bundles);

  return (
    <CatalogScreen
      bundles={bundles}
      chips={collectionChips(all)}
      active={`/c/${encodeURIComponent(collection)}`}
      token={admin.mutationToken}
      allSlugs={all.map((bundle) => bundle.slug)}
      previewGrants={grants}
      view={view}
      {...(loose ? {} : { collection: wanted })}
      {...(bundles.length === 0 ? {} : { heading: "newest first" })}
      emptyNote={<EmptyCollection name={name} />}
    />
  );
}
