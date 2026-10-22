"use client";

import { Fragment, type ReactNode, useEffect, useMemo, useRef } from "react";
import { highlightParts } from "@/app/_ui/fuzzy";
import { useSearch } from "@/app/_ui/search-state";

export type HitNode = { slug: string; node: ReactNode };

export function SearchList({ layout, items }: { layout: "grid" | "table"; items: HitNode[] }) {
  const search = useSearch();
  const nodes = useMemo(() => new Map(items.map((item) => [item.slug, item.node])), [items]);
  const shown = search.slugs.map((slug) => <Fragment key={slug}>{nodes.get(slug)}</Fragment>);
  const none = search.slugs.length === 0;
  const message = <>No title matches &quot;{search.query.trim()}&quot;</>;

  if (layout === "table") {
    return (
      <tbody id="catalog-hits">
        {none ? (
          <tr>
            <td className="search-empty" colSpan={8}>
              {message}
            </td>
          </tr>
        ) : (
          shown
        )}
      </tbody>
    );
  }
  return none ? (
    <div className="empty search-empty" id="catalog-hits">
      <p>{message}</p>
    </div>
  ) : (
    <div className="grid" id="catalog-hits">
      {shown}
    </div>
  );
}

export function EmptyHits({ note }: { note: ReactNode }) {
  const search = useSearch();
  return (
    <div id="catalog-hits">
      {search.searching ? (
        <div className="empty search-empty">
          <p>No title matches &quot;{search.query.trim()}&quot;</p>
        </div>
      ) : (
        note
      )}
    </div>
  );
}

function useHit<T extends HTMLElement>(slug: string) {
  const search = useSearch();
  const ref = useRef<T>(null);
  const on = search.active === slug;
  useEffect(() => {
    if (on) ref.current?.scrollIntoView({ block: "nearest" });
  }, [on]);
  return { ref, id: `hit-${slug}`, on };
}

export function HitRow({ slug, children }: { slug: string; children: ReactNode }) {
  const hit = useHit<HTMLTableRowElement>(slug);
  return (
    <tr ref={hit.ref} id={hit.id} {...(hit.on ? { "data-hi": "" } : {})}>
      {children}
    </tr>
  );
}

export function HitCard({ slug, children }: { slug: string; children: ReactNode }) {
  const hit = useHit<HTMLElement>(slug);
  return (
    <article className="card" ref={hit.ref} id={hit.id} {...(hit.on ? { "data-hi": "" } : {})}>
      {children}
    </article>
  );
}

export function MatchTitle({ slug, title }: { slug: string; title: string }) {
  const search = useSearch();
  const parts = highlightParts(title, search.marks.get(slug) ?? []);
  return (
    <>
      {parts.map((part) =>
        part.hit ? (
          <mark key={part.start}>{part.text}</mark>
        ) : (
          <Fragment key={part.start}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

export function OrderLabel() {
  const search = useSearch();
  return <>{search.searching ? "best match first" : "newest first"}</>;
}
