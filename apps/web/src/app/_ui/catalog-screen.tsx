import type { Bundle } from "@hosti/shared";
import Link from "next/link";
import { type ChipCount, formatDate, plural } from "@/app/_ui/format";
import { Chips, Masthead, ShareFlag, Thumb } from "@/app/_ui/pieces";
import { UploadDrop } from "@/app/_ui/upload-drop";

/** The catalog grid, shared by `/` and `/c/<collection>`. */
export function CatalogScreen(props: {
  bundles: Bundle[];
  chips: ChipCount[];
  active: string;
  token: string;
  heading: string;
  lead: React.ReactNode;
  emptyNote: React.ReactNode;
  /** Every slug in the catalog, so the drop zone can warn before a revision lands. */
  allSlugs: string[];
  /** The collection this page lists, if it lists one. */
  collection?: string;
}) {
  const { bundles, chips, active, token, heading, lead, emptyNote, allSlugs } = props;
  // An empty catalog drops the lead and the chips: there is nothing to say
  // about cards that are not there, and every count would read zero.
  const anyBundles = chips.some((chip) => chip.count > 0);
  return (
    <>
      <div className="wrap">
        <Masthead meta={heading} token={token} />
        {lead && anyBundles ? <p className="lead">{lead}</p> : <div className="lead-gap" />}
        {anyBundles ? <Chips chips={chips} active={active} /> : null}
        <UploadDrop
          token={token}
          slugs={allSlugs}
          {...(props.collection ? { defaultCollection: props.collection } : {})}
        />
        {bundles.length === 0 ? (
          emptyNote
        ) : (
          <div className="grid">
            {bundles.map((bundle) => (
              <Card key={bundle.slug} bundle={bundle} />
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}

function Card({ bundle }: { bundle: Bundle }) {
  const href = `/b/${bundle.slug}`;
  const open = bundle.currentRevision ? `/b/${bundle.slug}/preview/` : null;
  return (
    <article className="card">
      <Thumb
        seed={bundle.slug}
        size="card"
        href={href}
        live={bundle.currentRevision ? bundle.slug : undefined}
        label={`Preview of ${bundle.title}`}
      />
      <div className="card-body">
        <h2>
          <Link href={href}>{bundle.title}</Link>
        </h2>
        <Link className="card-slug" href={href}>
          {bundle.slug}
        </Link>
        <p className="card-meta">
          {bundle.collection ?? "no collection"} &middot; {plural(bundle.revisionCount, "revision")}{" "}
          &middot; {formatDate(bundle.updatedAt)}
        </p>
      </div>
      {/* Open, not delete. The card's loudest control should be the one used
          every day, and deleting still lives on the bundle's own page. */}
      <div className="card-foot">
        <ShareFlag count={bundle.shareSlugs.length} />
        {open ? (
          <a className="card-open" href={open} target="_blank" rel="noreferrer">
            open <span aria-hidden="true">&#8599;</span>
          </a>
        ) : (
          <span className="card-open" aria-disabled="true">
            no revision
          </span>
        )}
      </div>
    </article>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <span>
        Push with <span className="mono">hosti push ./out --slug my-report</span>.
      </span>
      <span>The catalog needs the owner password. A share link never does.</span>
    </footer>
  );
}

/**
 * What a new install sees first. It is the only screen where the catalog has
 * to teach rather than list, so it is the whole first move in order: mint a
 * token, push a folder, then decide who may see it.
 */
export function EmptyCatalog() {
  return (
    <div className="empty">
      <h2>Nothing pushed yet</h2>
      <p className="empty-lead">
        A bundle is a folder of static files with an <span className="mono">index.html</span> at its
        root. Hosti gives it a URL. Two commands and this page fills up.
      </p>
      <ol className="steps">
        <li>
          <h3>Mint a push token</h3>
          <p>From the repository root. It is the only secret an agent ever holds.</p>
          <pre>npm run token:new -- --name laptop</pre>
        </li>
        <li>
          <h3>Push a folder</h3>
          <p>
            From wherever the bundle is. Or drag a <span className="mono">.zip</span> onto this
            page.
          </p>
          <pre>
            export HOSTI_URL=http://127.0.0.1:3000{"\n"}export HOSTI_TOKEN=hosti_&hellip;{"\n"}hosti
            push ./out --slug my-report
          </pre>
        </li>
        <li>
          <h3>Decide who may open it</h3>
          <p>
            It arrives private, and it stays private. Nothing is public until you create a share
            link from the bundle&apos;s own page.
          </p>
        </li>
      </ol>
    </div>
  );
}

/** A collection with nothing in it. No setup advice, the owner has bundles. */
export function EmptyCollection({ name }: { name: string }) {
  return (
    <div className="empty">
      <h2>Nothing in {name}</h2>
      <p className="empty-lead">
        No bundle carries this collection right now. A push sets one with{" "}
        <span className="mono">--collection</span>, and the bundle page sets one by hand.
      </p>
      <p>
        <Link className="btn" href="/">
          back to every bundle
        </Link>
      </p>
    </div>
  );
}
