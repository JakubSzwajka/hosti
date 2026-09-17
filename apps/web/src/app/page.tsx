import { CatalogScreen, EmptyCatalog } from "@/app/_ui/catalog-screen";
import { plural } from "@/app/_ui/format";
import { collectionChips } from "@/app/_ui/format";
import { requireAdmin } from "@/server/auth/admin";
import { listCatalog } from "@/server/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Catalog() {
  const admin = await requireAdmin();
  const bundles = listCatalog();
  const chips = collectionChips(bundles);
  const collections = chips.length - 2;

  return (
    <CatalogScreen
      bundles={bundles}
      chips={chips}
      active="/"
      token={admin.mutationToken}
      allSlugs={bundles.map((bundle) => bundle.slug)}
      heading={
        bundles.length === 0
          ? "no bundles yet"
          : `${plural(bundles.length, "bundle")} \u00b7 ${plural(collections, "collection")} \u00b7 newest first`
      }
      lead={
        <>
          Everything an agent has pushed to this box. Each card runs the bundle itself, boxed in so
          it cannot reach the catalog. The block on each card says{" "}
          <strong>who can open it without the owner password</strong>.
        </>
      }
      emptyNote={<EmptyCatalog />}
    />
  );
}
