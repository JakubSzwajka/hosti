export const dynamic = "force-dynamic";

/**
 * Placeholder for the catalog. The catalog UI, the login screen and the bundle
 * detail page belong to a later slice; this page only proves the app boots.
 */
export default function CatalogPlaceholder() {
  return (
    <main>
      <h1>Hosti</h1>
      <p>The engine is up. The catalog UI is not built yet.</p>
      <p>
        Push a bundle with <code>POST /api/v1/bundles/&lt;slug&gt;/revisions</code> and open it at{" "}
        <code>/v/&lt;share-slug&gt;/</code>.
      </p>
    </main>
  );
}
