import type { Bundle } from "@hosti/shared";
import Link from "next/link";
import { type ChipCount, formatDate, plural } from "@/app/_ui/format";
import { OnboardingPanel } from "@/app/_ui/onboarding-panel";
import { Chips, Masthead, ShareFlag, Thumb } from "@/app/_ui/pieces";
import { UploadDrop } from "@/app/_ui/upload-drop";

export function CatalogScreen(props: {
  bundles: Bundle[];
  chips: ChipCount[];
  active: string;
  token: string;
  heading?: string;
  emptyNote: React.ReactNode;
  allSlugs: string[];
  collection?: string;
}) {
  const { bundles, chips, active, token, heading, emptyNote, allSlugs } = props;
  const anyBundles = chips.some((chip) => chip.count > 0);
  return (
    <>
      <div className="wrap catalog-shell">
        <Masthead meta={<CatalogMeta heading={heading} />} token={token} />
        <div className="register-line">
          <span>catalog</span>
          <span>{plural(bundles.length, "frame")}</span>
        </div>

        <div className="bar">
          {anyBundles ? <Chips chips={chips} active={active} /> : null}
          <UploadDrop
            token={token}
            slugs={allSlugs}
            {...(props.collection ? { defaultCollection: props.collection } : {})}
          />
        </div>
        {bundles.length === 0 ? (
          emptyNote
        ) : (
          <div className="grid">
            {bundles.map((bundle, index) => (
              <Card key={bundle.slug} bundle={bundle} frame={index + 1} />
            ))}
          </div>
        )}
        {anyBundles ? (
          <footer className="sheet-tail">
            <span>{plural(bundles.length, "bundle")}, newest first</span>
            <span>hosti, one box, one domain</span>
          </footer>
        ) : null}
      </div>
      {anyBundles ? null : <EmptyFooter />}
    </>
  );
}

function Card({ bundle, frame }: { bundle: Bundle; frame: number }) {
  const href = `/b/${bundle.slug}`;
  const current = bundle.currentRevision;
  return (
    <article className="card">
      <div className="card-window">
        <p className="window-bar">
          <span className="where">/b/{bundle.slug}/</span>
          <span>{current ? `r${current.seq}` : "no revision"}</span>
        </p>
        <Thumb
          seed={bundle.slug}
          size="card"
          href={href}
          live={current ? bundle.slug : undefined}
          label={`Preview of ${bundle.title}`}
          fileCount={current?.fileCount ?? 0}
          byteSize={current?.byteSize ?? 0}
        />
      </div>
      <div className="card-body">
        <span className="frame-no">{String(frame).padStart(2, "0")}</span>
        <div className="card-name">
          <h2>
            <Link href={href}>{bundle.title}</Link>
          </h2>
          <p className="card-slug">{bundle.slug}</p>
        </div>
      </div>
      <p className="card-meta">
        {bundle.collection ?? "no collection"} <span>&middot;</span>{" "}
        {plural(bundle.revisionCount, "revision")} <span>&middot;</span>{" "}
        {formatDate(bundle.updatedAt)}
      </p>
      <div className="card-foot">
        <ShareFlag mode={bundle.sharing.mode} />
        {current ? (
          <Link className="card-open" href={href}>
            open <span aria-hidden="true">&#8599;</span>
          </Link>
        ) : (
          <span className="card-open" aria-disabled="true">
            nothing to open
          </span>
        )}
      </div>
    </article>
  );
}

/**
 * The masthead's right-hand slot. `/tokens` is reachable from here because
 * the onboarding panel stops being the page the moment a bundle lands, and
 * the owner still has to get back to it to mint or revoke.
 */
function CatalogMeta({ heading }: { heading?: string }) {
  return (
    <span className="mast-meta">
      {heading ? <span>{heading}</span> : null}
      <Link href="/tokens">push tokens</Link>
    </span>
  );
}

function EmptyFooter() {
  return (
    <footer className="foot">
      <span>The catalog needs an admin session. A share link never does.</span>
    </footer>
  );
}

/**
 * The empty catalog is the onboarding panel and nothing else. It used to be
 * three steps that sent the owner to a shell on the server for
 * `npm run token:new`, which nobody on a Dokploy box can reach without
 * opening a container terminal.
 */
export function EmptyCatalog({ baseUrl, token }: { baseUrl: string; token: string }) {
  return (
    <div className="empty onboard-shell">
      {/* A refused name lands on /tokens, never here: the mint route sends
          every answer there, so this panel has no refusal to show. */}
      <OnboardingPanel
        baseUrl={baseUrl}
        token={token}
        secret={null}
        nameRefused={false}
        heading="Nothing pushed yet"
      />
    </div>
  );
}

export function EmptyCollection({ name }: { name: string }) {
  return (
    <div className="empty">
      <h2>Nothing in {name}</h2>
      <p>
        <Link className="btn" href="/">
          back to every bundle
        </Link>
      </p>
    </div>
  );
}
