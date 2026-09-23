import type { SharingMode } from "@hosti/shared";
import Link from "next/link";
import { formatBytes, plural } from "@/app/_ui/format";
import { Mark } from "@/app/_ui/mark";
import { Shot } from "@/app/_ui/shot";
import { previewGrant } from "@/server/serving/preview-token";

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

export function ShareFlag({ mode }: { mode: SharingMode }) {
  return (
    <span className="flag" data-s={mode}>
      {mode}
    </span>
  );
}

function bars(seed: string, count: number): { id: string; height: number }[] {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) % 9973;
  return Array.from({ length: count }, (_, step) => ({
    id: `${seed}-bar-${step}`,
    height: 22 + ((hash + step * 37) % 42),
  }));
}

export function Thumb({
  seed,
  size,
  href,
  live,
  openHref,
  label,
  fileCount,
  byteSize,
}: {
  seed: string;
  size: "card" | "detail";
  href?: string | undefined;
  live?: string | undefined;
  openHref?: string | undefined;
  label?: string | undefined;
  fileCount: number;
  byteSize: number;
}) {
  const card = size === "card";
  const grant = live ? previewGrant(live) : null;
  const entry = live ? "index.html" : "no entry file";
  const facts = (
    <>
      <span className="entry">{entry}</span>
      <span>{plural(fileCount, "file")}</span>
      <span className="bytes">{formatBytes(byteSize)}</span>
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
      facts={facts}
    >
      <span className="plate-word">{live ? "loading" : "no revision"}</span>
      {live ? (
        <span className="plate-bars">
          {bars(seed, card ? 6 : 9).map((bar) => (
            <i key={bar.id} style={{ height: `${bar.height}px` }} />
          ))}
        </span>
      ) : (
        <span className="plate-path">nothing to serve at /b/{seed}/</span>
      )}
    </Shot>
  );
}
