import { COLLECTION_RULE } from "@hosti/shared";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "@/app/_ui/catalog-screen";
import { CopyButton } from "@/app/_ui/copy-button";
import { formatBytes, formatDate, plural } from "@/app/_ui/format";
import { ShareFlag, Thumb } from "@/app/_ui/pieces";
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
  const confirming = query.delete === "1";
  const current = revisions.find((revision) => revision.current);
  const token = admin.mutationToken;

  return (
    <>
      <div className="wrap">
        <Link className="back" href="/">
          &#8592; back to the catalog
        </Link>
        <div className="detail-head">
          <h2>{bundle.title}</h2>
        </div>
        <p className="detail-meta">
          <span className="mono">/b/{bundle.slug}</span>
          <span>collection: {bundle.collection ?? "none"}</span>
          <span>{plural(revisions.length, "revision")}</span>
          <span>last push {formatDate(bundle.updated_at)}</span>
          <ShareFlag count={links.length} />
        </p>

        <Thumb
          seed={bundle.slug}
          size="detail"
          live={current ? bundle.slug : undefined}
          label={`Preview of ${bundle.title}`}
        />
        <p className="preview-cap">
          {current
            ? `Revision r${current.seq}, running live in a sandboxed frame. Only you can open it.`
            : "No revision has landed yet, so there is nothing to preview."}
        </p>

        <div className="detail-cols">
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
            <p className="note" style={{ marginTop: "12px" }}>
              Every push keeps the newest {plural(keep, "revision")} of this bundle and deletes the
              rest. The current one never goes, whatever the count says. Change it with{" "}
              <span className="mono">HOSTI_KEEP_REVISIONS</span>.
            </p>
          </section>

          <div>
            <CollectionSection
              slug={bundle.slug}
              collection={bundle.collection}
              known={listCollections()}
              token={token}
              refused={query.collection}
            />
            <ShareLinks slug={bundle.slug} links={links} token={token} refused={query.share} />
            <DeleteSection slug={bundle.slug} token={token} confirming={confirming} />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

/**
 * Set, change or clear the bundle's collection. A collection is a flat label,
 * so this is one text field: type a name that exists, type a new one, or drop
 * the bundle out of every collection.
 */
function CollectionSection({
  slug,
  collection,
  known,
  token,
  refused,
}: {
  slug: string;
  collection: string | null;
  known: string[];
  token: string;
  refused?: string;
}) {
  const others = known.filter((name) => name !== collection);
  return (
    <section className="sect">
      <h3>Collection</h3>
      {refused === "bad_collection" ? <p className="error">{COLLECTION_RULE}.</p> : null}
      <form className="set-collection" method="post" action={`/b/${slug}/collection`}>
        <input type="hidden" name="token" value={token} />
        <label>
          in
          <input
            name="collection"
            defaultValue={collection ?? ""}
            list={`collections-${slug}`}
            maxLength={64}
            autoComplete="off"
            placeholder="no collection"
            aria-label={`collection for ${slug}`}
          />
        </label>
        <datalist id={`collections-${slug}`}>
          {others.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button className="btn" type="submit">
          save
        </button>
      </form>
      {collection ? (
        <form method="post" action={`/b/${slug}/collection`}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="clear" value="1" />
          <button className="btn" type="submit" data-tone="danger">
            clear it
          </button>
        </form>
      ) : null}
      <p className="note" style={{ marginTop: "12px" }}>
        A collection is a flat label, never a directory, and a bundle sits in zero or one. Clearing
        it moves this bundle to <span className="mono">no collection</span>.
      </p>
    </section>
  );
}

const SHARE_REFUSALS: Record<string, string> = {
  share_link_exists: "That door is already open. Revoke it, or ask for an unlisted link.",
  slug_too_long: "An unlisted link would push the slug past 64 characters.",
  bad_pin: "A pin is four to eight digits and nothing else.",
  not_configured: "Set HOSTI_SECRET in the environment before a link can carry a pin.",
};

function ShareLinks({
  slug,
  links,
  token,
  refused,
}: {
  slug: string;
  links: { slug: string; url: string; createdAt: string; hasPin: boolean }[];
  token: string;
  refused?: string;
}) {
  const refusal = refused ? SHARE_REFUSALS[refused] : undefined;
  return (
    <section className="sect">
      <h3>Share links</h3>
      {refusal ? <p className="error">{refusal}</p> : null}
      {links.length === 0 ? (
        <p className="note">
          This bundle is private. Nothing at <span className="mono">/v/{slug}/</span> answers until
          you create a link.
        </p>
      ) : null}
      {links.map((link) => (
        <div className="link-card" key={link.slug}>
          <p className="path">{link.url}</p>
          <p className="props">
            <span>{link.slug === slug ? "bundle slug" : "unlisted"}</span>
            <span>created {formatDate(link.createdAt)}</span>
            <span data-pin={link.hasPin ? "" : undefined}>
              {link.hasPin ? "pin set" : "no pin"}
            </span>
          </p>
          <span className="acts">
            <CopyButton value={link.url} />
            <a className="btn" href={link.url} target="_blank" rel="noreferrer">
              open
            </a>
            <form method="post" action={`/b/${slug}/share-links/revoke`}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="shareSlug" value={link.slug} />
              <button className="btn" type="submit" data-tone="danger">
                revoke
              </button>
            </form>
          </span>
          <PinControls slug={slug} link={link} token={token} />
        </div>
      ))}
      <form className="make-link" method="post" action={`/b/${slug}/share-links`}>
        <input type="hidden" name="token" value={token} />
        <button className="btn" type="submit">
          create share link
        </button>
        <label>
          <input type="checkbox" name="unlisted" value="1" />
          unlisted, eight random characters on the end
        </label>
        <label>
          pin
          <input
            className="pin-field"
            type="text"
            name="pin"
            inputMode="numeric"
            maxLength={8}
            autoComplete="off"
            placeholder="optional"
          />
        </label>
      </form>
      <p className="note" style={{ marginTop: "12px" }}>
        A pin is four to eight digits and it is yours to choose. Hosti hashes it, so nobody can read
        it back here; to change one, type a new one.
      </p>
    </section>
  );
}

/** Set, replace or remove one link's PIN. The digits are never shown back. */
function PinControls({
  slug,
  link,
  token,
}: {
  slug: string;
  link: { slug: string; hasPin: boolean };
  token: string;
}) {
  return (
    <span className="pin-row">
      <form method="post" action={`/b/${slug}/share-links/pin`}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="shareSlug" value={link.slug} />
        <input
          className="pin-field"
          type="text"
          name="pin"
          inputMode="numeric"
          maxLength={8}
          autoComplete="off"
          aria-label={link.hasPin ? `replace the pin on ${link.slug}` : `set a pin on ${link.slug}`}
          placeholder="4 to 8 digits"
        />
        <button className="btn" type="submit">
          {link.hasPin ? "replace pin" : "set pin"}
        </button>
      </form>
      {link.hasPin ? (
        <form method="post" action={`/b/${slug}/share-links/pin`}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="shareSlug" value={link.slug} />
          <input type="hidden" name="remove" value="1" />
          <button className="btn" type="submit" data-tone="danger">
            remove pin
          </button>
        </form>
      ) : null}
    </span>
  );
}

function DeleteSection({
  slug,
  token,
  confirming,
}: {
  slug: string;
  token: string;
  confirming: boolean;
}) {
  return (
    <section className="sect" id="delete">
      <h3>Delete</h3>
      <p className="note">
        Deleting takes every revision, every file and every share link with it. Anyone holding a
        link gets a 404 straight away.
      </p>
      {confirming ? (
        <form className="acts" method="post" action={`/b/${slug}/delete`}>
          <input type="hidden" name="token" value={token} />
          <button className="btn" type="submit" data-tone="danger">
            yes, delete {slug}
          </button>
          <Link className="btn" href={`/b/${slug}`}>
            keep it
          </Link>
        </form>
      ) : (
        <Link className="btn" href={`/b/${slug}?delete=1#delete`} data-tone="danger">
          delete this bundle
        </Link>
      )}
    </section>
  );
}
