import type { PreviewGrant } from "@hosti/serving";
import { headers } from "next/headers";
import { CatalogScreen, EmptyCatalog, parseView } from "@/app/_ui/catalog-screen";
import { collectionChips } from "@/app/_ui/format";
import { previewGrants } from "@/app/_http/preview-grants";
import { requireAdmin } from "@/server/auth/admin";
import { baseUrlFromHeaders } from "@/server/config";
import { listCatalog } from "@/use-cases/list-catalog";
import { runAppUseCase } from "@/app/_http/run-use-case";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const view = parseView((await searchParams).view);
  const admin = await requireAdmin();
  const bundles = await runAppUseCase(listCatalog());
  const chips = collectionChips(bundles);
  const grants = view === "table" ? new Map<string, PreviewGrant>() : await previewGrants(bundles);
  const baseUrl = baseUrlFromHeaders(await headers());

  return (
    <CatalogScreen
      bundles={bundles}
      chips={chips}
      active="/"
      token={admin.mutationToken}
      allSlugs={bundles.map((bundle) => bundle.slug)}
      previewGrants={grants}
      view={view}
      {...(bundles.length === 0 ? {} : { heading: "newest first" })}
      emptyNote={<EmptyCatalog baseUrl={baseUrl} />}
    />
  );
}
