import Link from "next/link";
import { plural } from "@/app/_ui/format";
import { Mark } from "@/app/_ui/mark";
import { Shot } from "@/app/_ui/shot";
import { previewGrant } from "@/server/serving/preview-token";

/**
 * The small parts every catalog screen reuses: the masthead, the collection
 * chips, the share-state block and the placeholder preview.
 */

export function Masthead({ meta, token }: { meta?: React.ReactNode; token: string }) {
  return (
    <header className="mast">
      <h1>
        <Link className="wordmark" href="/">
          <Mark size={19} />
          hosti
        </Link>
      </h1>
      <div className="meta">
        {meta ? <span>{meta}</span> : null}
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

export function Chips({
  chips,
  active,
}: {
  chips: { name: string; href: string; count: number }[];
  active: string;
}) {
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
 * `private`, a shared one reads `shared` with how many links it has.
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
 * A bundle's preview slot. The bundle itself renders here, live, in a
 * sandboxed frame. The drawn shape underneath is what shows while the frame
 * is still coming, and what is left when a bundle has no revision to render.
 */
export function Thumb({
  seed,
  size,
  href,
  live,
  openHref,
  label,
}: {
  seed: string;
  size: "card" | "detail";
  href?: string;
  /** The bundle slug, when it has a current revision worth framing. */
  live?: string;
  /** Where clicking the picture opens the bundle itself, in a new tab. */
  openHref?: string;
  label?: string;
}) {
  const card = size === "card";
  const grant = live ? previewGrant(live) : null;
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
  return (
    <Shot
      className={card ? "thumb" : "preview"}
      width={card ? "card" : "detail"}
      src={grant?.src}
      expiresAt={grant?.expiresAt}
      href={href}
      openHref={openHref}
      label={label ?? `Preview of ${seed}`}
    >
      {inside}
    </Shot>
  );
}
