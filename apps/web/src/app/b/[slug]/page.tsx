import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBytes, formatDate, plural } from "@/app/_ui/format";
import { Masthead, Thumb } from "@/app/_ui/pieces";
import { CollectionPicker } from "@/app/b/[slug]/collection-picker";
import { SharingIsland } from "@/app/b/[slug]/sharing-island";
import { requireAdmin } from "@/server/auth/admin";
import { findBundle, listCatalog, listCollections, listRevisions } from "@/server/catalog";
import { baseUrlFromHeaders } from "@/server/config";
import { CATALOG_UPLOAD } from "@/server/push-tokens";
import { describeSharing, shareUrl } from "@/server/sharing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARE_REFUSALS: Record<string, string> = {
  bad_mode: "pick private, link or pin.",
  bad_pin: "a pin is four to eight digits and nothing else.",
  pin_required: "type a pin before you put this bundle behind one.",
  pin_not_wanted: "a pin only belongs on the pin state.",
  not_configured: "set HOSTI_SECRET before a bundle can carry a pin.",
};

function arrivalNote(pushedBy: string | null): string | null {
  if (pushedBy === null) return null;
  if (pushedBy === CATALOG_UPLOAD) return "uploaded in the catalog";
  return `pushed by ${pushedBy}`;
}

export default async function BundleDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    delete?: string;
    share?: string;
    collection?: string;
    rotate?: string;
    pin?: string;
  }>;
}) {
  const admin = await requireAdmin();
  const { slug } = await params;
  const bundle = findBundle(slug);
  if (!bundle) notFound();

  const baseUrl = baseUrlFromHeaders(await headers());
  const revisions = listRevisions(bundle.id);
  const current = revisions.find((revision) => revision.current);
  const arrival = current ? arrivalNote(current.pushedBy) : null;
  const sharing = describeSharing(bundle);
  const liveUrl = shareUrl(sharing, baseUrl);
  const deadUrl = `${baseUrl.replace(/\/$/, "")}/v/${sharing.shareSlug}/`;
  const query = await searchParams;
  const catalog = listCatalog();
  const position = catalog.findIndex((entry) => entry.slug === slug);
  const token = admin.mutationToken;
  const collections = listCollections();

  return (
    <div className="wrap bundle-shell">
      <Masthead token={token} />
      <div className="register-line">
        <span>bundle</span>
        <span>
          frame {String(position + 1).padStart(2, "0")} of {String(catalog.length).padStart(2, "0")}
        </span>
      </div>
      <Link className="back" href="/">
        &#8592; back to the catalog
      </Link>

      <div className="detail-head">
        <h2>{bundle.title}</h2>
      </div>

      <div className="detail-meta">
        <div className="detail-facts">
          <CollectionPicker
            slug={bundle.slug}
            collection={bundle.collection}
            known={collections}
            token={token}
            creating={query.collection === "new"}
            error={
              query.collection === "bad_collection"
                ? "use a flat collection name up to 64 characters."
                : undefined
            }
          />
          <span className="dot">&middot;</span>
          <span>{current ? `r${current.seq}` : "no revision"}</span>
          <span className="dot">&middot;</span>
          <span>{formatDate(bundle.updated_at)}</span>
          {arrival ? (
            <>
              <span className="dot">&middot;</span>
              <span>{arrival}</span>
            </>
          ) : null}
        </div>
        <OpenButton slug={bundle.slug} hasRevision={Boolean(current)} />
      </div>

      <Preview
        slug={bundle.slug}
        title={bundle.title}
        fileCount={current?.fileCount ?? 0}
        byteSize={current?.byteSize ?? 0}
        hasRevision={Boolean(current)}
      />
      <SharingIsland
        slug={bundle.slug}
        mode={sharing.mode}
        hasPin={sharing.hasPin}
        liveUrl={liveUrl}
        deadUrl={deadUrl}
        token={token}
        hasRevision={Boolean(current)}
        refused={query.share ? SHARE_REFUSALS[query.share] : undefined}
        replacingPin={query.pin === "replace"}
        confirmingRotate={query.rotate === "1"}
      />
      <DeleteStrip
        slug={bundle.slug}
        token={token}
        confirming={query.delete === "1"}
        fileCount={current?.fileCount ?? 0}
        revisionCount={revisions.length}
        hasShareLink={sharing.mode !== "private"}
      />
    </div>
  );
}

function OpenButton({ slug, hasRevision }: { slug: string; hasRevision: boolean }) {
  if (!hasRevision) {
    return (
      <span className="btn" data-tone="go" aria-disabled="true">
        nothing to open yet
      </span>
    );
  }
  return (
    <a className="btn" data-tone="go" href={`/b/${slug}/preview/`} target="_blank" rel="noreferrer">
      open bundle <span aria-hidden="true">&#8599;</span>
    </a>
  );
}

function Preview({
  slug,
  title,
  fileCount,
  byteSize,
  hasRevision,
}: {
  slug: string;
  title: string;
  fileCount: number;
  byteSize: number;
  hasRevision: boolean;
}) {
  return (
    <section className="preview-panel" aria-label="bundle preview">
      <p className="preview-bar">
        <span className="where">/b/{slug}/</span>
        <span className="rev">
          {hasRevision ? "index.html" : "no entry file"} &middot; {formatBytes(byteSize)}
        </span>
      </p>
      <Thumb
        seed={slug}
        size="detail"
        live={hasRevision ? slug : undefined}
        openHref={hasRevision ? `/b/${slug}/preview/` : undefined}
        label={`Preview of ${title}`}
        fileCount={fileCount}
        byteSize={byteSize}
      />
    </section>
  );
}

function DeleteStrip({
  slug,
  token,
  confirming,
  fileCount,
  revisionCount,
  hasShareLink,
}: {
  slug: string;
  token: string;
  confirming: boolean;
  fileCount: number;
  revisionCount: number;
  hasShareLink: boolean;
}) {
  const costs = [plural(fileCount, "file"), plural(revisionCount, "revision")];
  if (hasShareLink) costs.push("the share link");
  const last = costs.pop();
  const cost = `${costs.join(", ")} and ${last}`;

  return (
    <div className="danger-strip" id="delete" {...(confirming ? { "data-confirm": "" } : {})}>
      {confirming ? (
        <>
          <p>
            this takes {cost}.{" "}
            {hasShareLink ? "anyone holding the link gets a 404 straight away." : ""}
          </p>
          <div className="delete-actions">
            <Link className="btn" href={`/b/${slug}`}>
              cancel
            </Link>
            <form method="post" action={`/b/${slug}/delete`}>
              <input type="hidden" name="token" value={token} />
              <button className="btn-red" type="submit">
                yes, delete
              </button>
            </form>
          </div>
        </>
      ) : (
        <Link className="btn-red" href={`/b/${slug}?delete=1#delete`}>
          delete bundle
        </Link>
      )}
    </div>
  );
}
