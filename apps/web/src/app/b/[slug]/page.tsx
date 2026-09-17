import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "@/app/_ui/catalog-screen";
import { CopyButton } from "@/app/_ui/copy-button";
import { formatBytes, formatDate, plural } from "@/app/_ui/format";
import { Masthead, ShareFlag, Thumb } from "@/app/_ui/pieces";
import { CollectionSection, ShareLinks } from "@/app/b/[slug]/sections";
import { requireAdmin } from "@/server/auth/admin";
import { findBundle, listCollections, listRevisions } from "@/server/catalog";
import { baseUrlFromHeaders, keepRevisions } from "@/server/config";
import { listShareLinks } from "@/server/share-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BundleDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ delete?: string; share?: string; collection?: string }>;
}) {
  const admin = await requireAdmin();
  const { slug } = await params;
  const bundle = findBundle(slug);
  if (!bundle) notFound();

  const baseUrl = baseUrlFromHeaders(await headers());
  const revisions = listRevisions(bundle.id);
  const links = listShareLinks(bundle.id, baseUrl);
  const query = await searchParams;
  const keep = keepRevisions();
  const current = revisions.find((revision) => revision.current);
  const token = admin.mutationToken;
  // The link to hand out, when there is one: the bundle's own slug first,
  // because that is the link the owner typed rather than one Hosti invented.
  const handout = links.find((link) => link.slug === bundle.slug) ?? links[0];

  return (
    <>
      <div className="wrap">
        <Masthead
          meta={
            bundle.collection ? (
              <Link className="meta-link" href={`/c/${encodeURIComponent(bundle.collection)}`}>
                in {bundle.collection}
              </Link>
            ) : (
              "no collection"
            )
          }
          token={token}
        />
        <Link className="back" href="/">
          &#8592; back to the catalog
        </Link>

        <div className="detail-head">
          <h2>{bundle.title}</h2>
          <div className="head-acts">
            <OpenButton slug={bundle.slug} hasRevision={Boolean(current)} />
            {handout ? (
              <CopyButton value={handout.url} />
            ) : (
              <span className="btn" aria-disabled="true">
                copy share link
              </span>
            )}
          </div>
        </div>
        {handout ? null : (
          <p className="head-why">
            Nothing to copy yet: this bundle is private. <a href="#share">Create a share link</a>{" "}
            and this button hands it out.
          </p>
        )}

        <p className="detail-meta">
          <span className="mono">/b/{bundle.slug}</span>
          <span className="dot">&middot;</span>
          <span>{plural(revisions.length, "revision")}</span>
          <span className="dot">&middot;</span>
          <span>last push {formatDate(bundle.updated_at)}</span>
          <ShareFlag count={links.length} />
        </p>

        <div className="detail-cols">
          <div className="detail-col">
            <Preview slug={bundle.slug} title={bundle.title} seq={current?.seq} />
            <Revisions revisions={revisions} keep={keep} />
          </div>
          <div className="detail-col">
            <ShareLinks slug={bundle.slug} links={links} token={token} refused={query.share} />
            <CollectionSection
              slug={bundle.slug}
              collection={bundle.collection}
              known={listCollections()}
              token={token}
              refused={query.collection}
            />
          </div>
        </div>

        <DeleteStrip slug={bundle.slug} token={token} confirming={query.delete === "1"} />
      </div>
      <Footer />
    </>
  );
}

/**
 * The control the owner looks for first. It always opens the bundle the way
 * only the owner can, whether or not anyone else has been let in; the share
 * link has its own `open` beside it, because that shows what a guest sees.
 */
function OpenButton({ slug, hasRevision }: { slug: string; hasRevision: boolean }) {
  if (!hasRevision) {
    return (
      <span className="btn" data-tone="go" aria-disabled="true">
        nothing to open yet
      </span>
    );
  }
  return (
    <a
      className="btn"
      data-tone="go"
      href={`/b/${slug}/preview/`}
      target="_blank"
      rel="noreferrer"
      title="Opens the bundle in a new tab. Only you can reach this."
    >
      open bundle
      <span className="arw" aria-hidden="true">
        &#8599;
      </span>
    </a>
  );
}

/**
 * The bundle itself, live, framed as a window onto a page rather than a panel
 * that happens to stop. The bar names what is on screen and the base fades
 * out, so the crop reads as a crop.
 */
function Preview({ slug, title, seq }: { slug: string; title: string; seq?: number }) {
  return (
    <section className="preview-panel">
      <p className="preview-bar">
        <span className="where">/b/{slug}/</span>
        <span className="rev">{seq ? `r${seq}` : "no revision"}</span>
      </p>
      <Thumb
        seed={slug}
        size="detail"
        live={seq ? slug : undefined}
        openHref={seq ? `/b/${slug}/preview/` : undefined}
        label={`Preview of ${title}`}
      />
      <p className="preview-cap">
        {seq
          ? "Running live in a sandboxed frame, cropped to the first screen. Only you can open it."
          : "No revision has landed yet, so there is nothing to preview."}
      </p>
    </section>
  );
}

type RevisionRow = {
  seq: number;
  createdAt: string;
  fileCount: number;
  byteSize: number;
  current: boolean;
};

function Revisions({ revisions, keep }: { revisions: RevisionRow[]; keep: number }) {
  return (
    <section className="sect">
      <h3>Revisions</h3>
      <ul className="revs">
        {revisions.map((revision) => (
          <li key={revision.seq} {...(revision.current ? { "data-current": "" } : {})}>
            <span>r{revision.seq}</span>
            <span>{formatDate(revision.createdAt)}</span>
            <span>
              {plural(revision.fileCount, "file")}, {formatBytes(revision.byteSize)}
            </span>
            <span className="tag">{revision.current ? "current" : ""}</span>
          </li>
        ))}
      </ul>
      <p className="note">
        Every push keeps the newest {plural(keep, "revision")} and deletes the rest. The current one
        never goes, whatever the count says. Change it with{" "}
        <span className="mono">HOSTI_KEEP_REVISIONS</span>.
      </p>
    </section>
  );
}

/**
 * Deleting is real and it is confirmed, but it is not a daily control, so it
 * does not get a panel of its own weight. It sits last, in a line, under a
 * rule.
 */
function DeleteStrip({
  slug,
  token,
  confirming,
}: {
  slug: string;
  token: string;
  confirming: boolean;
}) {
  return (
    <div className="danger-strip" id="delete">
      <p>
        Deleting takes every revision, every file and every share link with it. Anyone holding a
        link gets a 404 straight away.
      </p>
      {confirming ? (
        <form className="acts" method="post" action={`/b/${slug}/delete`}>
          <input type="hidden" name="token" value={token} />
          <button className="btn" type="submit" data-tone="danger">
            yes, delete {slug}
          </button>
          <Link className="quiet-danger" href={`/b/${slug}`}>
            keep it
          </Link>
        </form>
      ) : (
        <Link className="quiet-danger" href={`/b/${slug}?delete=1#delete`}>
          delete this bundle
        </Link>
      )}
    </div>
  );
}
