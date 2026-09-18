import { CatalogScreen, EmptyCatalog } from "@/app/_ui/catalog-screen";
import { collectionChips } from "@/app/_ui/format";
import { requireAdmin } from "@/server/auth/admin";
import { listCatalog } from "@/server/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Catalog() {
  const admin = await requireAdmin();
  const bundles = listCatalog();
  const chips = collectionChips(bundles);

  return (
    <CatalogScreen
      bundles={bundles}
      chips={chips}
      active="/"
      token={admin.mutationToken}
      allSlugs={bundles.map((bundle) => bundle.slug)}
      {...(bundles.length === 0 ? {} : { heading: "newest first" })}
      emptyNote={<EmptyCatalog />}
    />
  );
}
