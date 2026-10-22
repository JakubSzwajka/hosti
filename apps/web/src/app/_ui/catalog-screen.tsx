import type { PreviewGrant } from "@hosti/serving";
import type { Bundle } from "@hosti/shared";
import Link from "next/link";
import {
  type ChipCount,
  formatBytes,
  formatDate,
  formatTotal,
  plural,
  totalBytes,
} from "@/app/_ui/format";
import { MiniThumb } from "@/app/_ui/mini-thumb";
import { OnboardingPanel } from "@/app/_ui/onboarding-panel";
import { Chips, Masthead, ShareFlag, Thumb } from "@/app/_ui/pieces";
import { SearchField } from "@/app/_ui/search-field";
import {
  EmptyHits,
  HitCard,
  type HitNode,
  HitRow,
  MatchTitle,
  OrderLabel,
  SearchList,
} from "@/app/_ui/search-hits";
import { SearchProvider } from "@/app/_ui/search-state";
import { UploadDrop } from "@/app/_ui/upload-drop";

export type CatalogView = "gallery" | "table";

export function parseView(value: string | string[] | undefined): CatalogView {
  return (Array.isArray(value) ? value[0] : value) === "table" ? "table" : "gallery";
}

export function CatalogScreen(props: {
  bundles: Bundle[];
  chips: ChipCount[];
  active: string;
  token: string;
  emptyNote: React.ReactNode;
  allSlugs: string[];
  previewGrants: ReadonlyMap<string, PreviewGrant>;
  collection?: string;
  view?: CatalogView;
}) {
  const { bundles, active, token, emptyNote, allSlugs, previewGrants } = props;
  const view = props.view ?? "gallery";
  const table = view === "table";
  // Chips keep the view, so moving between collections does not flip it back.
  const suffix = table ? "?view=table" : "";
  const chips = props.chips.map((chip) => ({ ...chip, href: `${chip.href}${suffix}` }));
  const total = formatTotal(totalBytes(bundles));
  const anyBundles = chips.some((chip) => chip.count > 0);
  const items = bundles.map(({ slug, title }) => ({ slug, title }));
  return (
    <SearchProvider items={items}>
      <div className="wrap catalog-shell">
        <Masthead meta={<CatalogMeta ordered={bundles.length > 0} />} token={token} />
        <div className="register-line">
          <span>catalog</span>
          <span className="reg-right">
            <span className="size-pill">
              total size <b>{total}</b>
            </span>
            <span>{plural(bundles.length, "frame")}</span>
          </span>
        </div>

        <div className="bar">
          {anyBundles ? <Chips chips={chips} active={`${active}${suffix}`} /> : null}
          {anyBundles ? <SearchField /> : null}
          {anyBundles ? <ViewToggle path={active} view={view} /> : null}
          <UploadDrop
            token={token}
            slugs={allSlugs}
            {...(props.collection ? { defaultCollection: props.collection } : {})}
          />
        </div>
        {bundles.length === 0 ? (
          anyBundles ? (
            <EmptyHits note={emptyNote} />
          ) : (
            emptyNote
          )
        ) : table ? (
          <BundleTable bundles={bundles} total={total} />
        ) : (
          <SearchList layout="grid" items={cards(bundles, previewGrants)} />
        )}
        {anyBundles ? (
          <footer className="sheet-tail">
            <span>
              {plural(bundles.length, "bundle")}, <OrderLabel />
            </span>
            <span>hosti, one box, one domain</span>
          </footer>
        ) : null}
      </div>
      {anyBundles ? null : <EmptyFooter />}
    </SearchProvider>
  );
}

function cards(bundles: Bundle[], previewGrants: ReadonlyMap<string, PreviewGrant>): HitNode[] {
  return bundles.map((bundle, index) => ({
    slug: bundle.slug,
    node: (
      <Card
        bundle={bundle}
        frame={index + 1}
        previewGrant={previewGrants.get(bundle.slug) ?? null}
      />
    ),
  }));
}

function ViewToggle({ path, view }: { path: string; view: CatalogView }) {
  const options = [
    { name: "gallery", label: "Gallery", href: path },
    { name: "table", label: "Table", href: `${path}?view=table` },
  ] as const;
  return (
    <nav className="view-toggle" aria-label="View">
      {options.map((option) => (
        <Link
          key={option.name}
          href={option.href}
          {...(option.name === view ? { "data-on": "", "aria-current": "true" as const } : {})}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

function BundleTable({ bundles, total }: { bundles: Bundle[]; total: string }) {
  return (
    // Browsers make a scroller keyboard-focusable, so a narrow screen can scroll it.
    <div className="dtable-scroll">
      <table className="dtable">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Preview</span>
            </th>
            <th scope="col">Bundle</th>
            <th scope="col">Collection</th>
            <th scope="col" className="num">
              Revs
            </th>
            <th scope="col" className="num">
              Updated
            </th>
            <th scope="col" className="num">
              Size
            </th>
            <th scope="col">Share</th>
            <th scope="col">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <SearchList
          layout="table"
          items={bundles.map((bundle) => ({
            slug: bundle.slug,
            node: <BundleRow bundle={bundle} />,
          }))}
        />
        <tfoot>
          <tr>
            <td colSpan={3}>{plural(bundles.length, "bundle")}</td>
            <td />
            <td />
            <td className="num">
              total <b>{total}</b>
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function BundleRow({ bundle }: { bundle: Bundle }) {
  const href = `/b/${bundle.slug}`;
  const current = bundle.currentRevision;
  return (
    <HitRow slug={bundle.slug}>
      <td className="c-thumb">
        <MiniThumb seed={bundle.slug} live={current !== null} />
      </td>
      <th scope="row" className="c-name">
        <span className="nm">
          <Link href={href}>
            <MatchTitle slug={bundle.slug} title={bundle.title} />
          </Link>
        </span>
        <span className="pt mono">
          /b/{bundle.slug}/ {current ? `r${current.seq}` : "no revision"}
        </span>
      </th>
      <td className="c-coll">{bundle.collection ?? "no collection"}</td>
      <td className="num">{bundle.revisionCount}</td>
      <td className="num">{formatDate(bundle.updatedAt)}</td>
      <td className="num c-size">{current ? formatBytes(current.byteSize) : "\u2014"}</td>
      <td>
        <ShareFlag mode={bundle.sharing.mode} small />
      </td>
      <td className="c-open">
        {current ? (
          <Link href={href}>
            open <span aria-hidden="true">&#8599;</span>
          </Link>
        ) : (
          <>
            <span aria-hidden="true">&mdash;</span>
            <span className="sr-only">nothing to open</span>
          </>
        )}
      </td>
    </HitRow>
  );
}

function Card({
  bundle,
  frame,
  previewGrant,
}: {
  bundle: Bundle;
  frame: number;
  previewGrant: PreviewGrant | null;
}) {
  const href = `/b/${bundle.slug}`;
  const current = bundle.currentRevision;
  return (
    <HitCard slug={bundle.slug}>
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
          previewGrant={previewGrant}
          label={`Preview of ${bundle.title}`}
          fileCount={current?.fileCount ?? 0}
          byteSize={current?.byteSize ?? 0}
        />
      </div>
      <div className="card-body">
        <span className="frame-no">{String(frame).padStart(2, "0")}</span>
        <div className="card-name">
          <h2>
            <Link href={href}>
              <MatchTitle slug={bundle.slug} title={bundle.title} />
            </Link>
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
    </HitCard>
  );
}

function CatalogMeta({ ordered }: { ordered: boolean }) {
  return (
    <span className="mast-meta">
      {ordered ? (
        <span>
          <OrderLabel />
        </span>
      ) : null}
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

export function EmptyCatalog({ baseUrl }: { baseUrl: string }) {
  return (
    <div className="empty onboard-shell">
      <OnboardingPanel baseUrl={baseUrl} heading="Nothing pushed yet" />
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
