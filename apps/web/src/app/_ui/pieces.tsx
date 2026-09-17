import type { Bundle } from "@hosti/shared";
import Link from "next/link";
import { NO_COLLECTION, plural } from "@/app/_ui/format";

/**
 * The small parts every catalog screen reuses: the masthead, the collection
 * chips, the share-state block and the placeholder preview.
 */

export function Masthead({ meta, token }: { meta: string; token: string }) {
  return (
    <header className="mast">
      <h1>
        <Link href="/">hosti</Link>
      </h1>
      <div className="meta">
        <span>{meta}</span>
        <form method="post" action="/logout">
          <input type="hidden" name="token" value={token} />
          <button className="sign-out" type="submit">
            log out
          </button>
        </form>
      </div>
    </header>
  );
}

export type ChipCount = { name: string; href: string; count: number };

/** Counts across the top: all bundles, each collection, then no collection. */
export function collectionChips(bundles: Bundle[]): ChipCount[] {
  const named = new Map<string, number>();
  let loose = 0;
  for (const bundle of bundles) {
    if (bundle.collection) named.set(bundle.collection, (named.get(bundle.collection) ?? 0) + 1);
    else loose += 1;
  }
  const chips: ChipCount[] = [{ name: "all bundles", href: "/", count: bundles.length }];
  for (const [name, count] of [...named].sort((a, b) => a[0].localeCompare(b[0]))) {
    chips.push({ name, href: `/c/${encodeURIComponent(name)}`, count });
  }
  chips.push({ name: "no collection", href: `/c/${NO_COLLECTION}`, count: loose });
  return chips;
}

export function Chips({ chips, active }: { chips: ChipCount[]; active: string }) {
  return (
    <ul className="chips">
      {chips.map((chip) => (
        <li key={chip.href}>
          <Link
            className="chip"
            href={chip.href}
            {...(chip.href === active ? { "data-on": "" } : {})}
          >
            {chip.name}
            <span className="n">{chip.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Share state as words on a block, not a coloured dot. A private bundle reads
 * `private`, an open one reads `shared` with how many doors it has.
 */
export function ShareFlag({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="flag" data-s="private">
        <b>private</b>
        <small>no link</small>
      </span>
    );
  }
  return (
    <span className="flag" data-s="shared">
      <b>shared</b>
      <small>{plural(count, "link")}</small>
    </span>
  );
}

/** Deterministic bar heights, so a card looks the same on every render. */
function bars(seed: string, count: number, scale: number): { id: string; height: number }[] {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) % 9973;
  const out: { id: string; height: number }[] = [];
  for (let step = 0; step < count; step += 1) {
    const spread = (hash + step * 37) % 100;
    out.push({
      id: `${seed}-bar-${step}`,
      height: Math.round(scale * (0.35 + (spread / 100) * 0.65)),
    });
  }
  return out;
}

/**
 * The preview a bundle would show once something screenshots its entry file.
 * Real thumbnails are a later slice, so this placeholder is drawn on purpose
 * and a bundle without one must not look broken.
 */
export function Thumb({
  seed,
  size,
  href,
}: {
  seed: string;
  size: "card" | "detail";
  href?: string;
}) {
  const card = size === "card";
  const inside = (
    <>
      <i className="h" />
      <i className="w1" />
      <i className="w2" />
      <i className="w3" />
      <span className="bars">
        {bars(seed, card ? 6 : 9, card ? 62 : 84).map((bar) => (
          <i key={bar.id} style={{ height: `${bar.height}px` }} />
        ))}
      </span>
      {card ? (
        <>
          <i className="w1" />
          <i className="w3" />
          <i className="w2" />
        </>
      ) : null}
    </>
  );
  const className = card ? "thumb" : "preview";
  if (href) {
    return (
      <Link className={className} href={href} aria-hidden="true" tabIndex={-1}>
        {inside}
      </Link>
    );
  }
  return (
    <div className={className} aria-hidden="true">
      {inside}
    </div>
  );
}
