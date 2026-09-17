import type { Bundle } from "@hosti/shared";
import Link from "next/link";
import { formatDate, plural } from "@/app/_ui/format";
import { type ChipCount, Chips, Masthead, ShareFlag, Thumb } from "@/app/_ui/pieces";

/** The catalog grid, shared by `/` and `/c/<collection>`. */
export function CatalogScreen(props: {
  bundles: Bundle[];
  chips: ChipCount[];
  active: string;
  token: string;
  heading: string;
  lead: React.ReactNode;
  emptyNote: React.ReactNode;
}) {
  const { bundles, chips, active, token, heading, lead, emptyNote } = props;
  // An empty catalog drops the lead and the chips: there is nothing to say
  // about cards that are not there, and every count would read zero.
  const anyBundles = chips.some((chip) => chip.count > 0);
  return (
    <>
      <div className="wrap">
        <Masthead meta={heading} token={token} />
        {lead && anyBundles ? <p className="lead">{lead}</p> : <div className="lead-gap" />}
        {anyBundles ? <Chips chips={chips} active={active} /> : null}
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
  return (
    <article className="card">
      <Thumb seed={bundle.slug} size="card" href={href} />
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
      <div className="card-foot">
        <ShareFlag count={bundle.shareSlugs.length} />
        <Link className="del" href={`${href}?delete=1#delete`}>
          delete
        </Link>
      </div>
    </article>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      Push with <span className="mono">hosti push ./out --slug garmin-q3</span>. The catalog needs
      the owner password. A share link never does.
    </footer>
  );
}

/** What a new install sees first: how to get a bundle in. */
export function EmptyCatalog() {
  return (
    <div className="empty">
      <h2>Nothing pushed yet</h2>
      <p>
        An agent puts a bundle here with one command. Mint a push token, then point the CLI at this
        server:
      </p>
      <pre>
        <span className="c"># mint a token, from the repository root</span>
        {"\n"}npm run token:new -- --name laptop{"\n\n"}
        <span className="c"># then, wherever the bundle is</span>
        {"\n"}export HOSTI_URL=http://127.0.0.1:3000{"\n"}export HOSTI_TOKEN=hosti_...{"\n"}hosti
        push ./out --slug my-report --title "My report"
      </pre>
      <p>
        The bundle arrives private. Open its page and create a share link when someone should see
        it.
      </p>
    </div>
  );
}

/** A collection with nothing in it. No setup advice, the owner has bundles. */
export function EmptyCollection({ name }: { name: string }) {
  return (
    <div className="empty">
      <h2>Nothing in {name}</h2>
      <p>
        No bundle carries this collection right now. A push sets it with the{" "}
        <span className="mono">--collection</span> flag.
      </p>
      <p>
        <Link className="btn" href="/">
          back to every bundle
        </Link>
      </p>
    </div>
  );
}
