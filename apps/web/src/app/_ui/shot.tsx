"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * A live look at a bundle: the bundle's own current revision, running in a
 * sandboxed frame and scaled down to fit the slot.
 *
 * Three things make this safe and cheap enough to put on every card.
 *
 * 1. `sandbox="allow-scripts"` with no `allow-same-origin`. The bundle gets an
 *    opaque origin, so its script cannot read the owner's cookie or call the
 *    catalog's own endpoints with credentials, even though it is served from
 *    this host.
 * 2. The frame is inert: no pointer events, no tab stop, hidden from the
 *    accessibility tree. The card's own link sits on top and takes the click.
 * 3. Nothing mounts until the card comes near the viewport, so a catalog of
 *    fifty bundles does not start fifty page loads at once.
 *
 * The drawn placeholder stays underneath. It is what the owner sees before a
 * frame mounts, and what is left showing when one never loads.
 */

/**
 * The viewport width a preview renders at before it is scaled down.
 *
 * A card is about 320px wide, so rendering a bundle at a 1280px viewport and
 * scaling it to fit puts the text at a quarter size, which is no text at all.
 * Rendering narrower means a bundle's own responsive rules fire and the type
 * lands around 7px on the card: not readable, but legible as shape, which is
 * what recognising a bundle at a glance actually needs.
 */
const PREVIEW_WIDTH = { card: 760, detail: 1100 } as const;

/** Start loading this many pixels before the card scrolls into view. */
const LOOKAHEAD_PX = 300;

type Box = { scale: number; height: number };

export function Shot({
  className,
  width,
  src,
  expiresAt,
  href,
  openHref,
  label,
  facts,
  children,
}: {
  className: string;
  /** Which render width this slot wants. */
  width: keyof typeof PREVIEW_WIDTH;
  /** The owner-only preview URL, or undefined when there is nothing to show. */
  src?: string;
  /**
   * When this page's grant dies. A card that comes into view after that would
   * be refused, and a refused frame still fires `load`, so it would paint a
   * blank box over the placeholder. Better to leave the placeholder up.
   */
  expiresAt?: number | null;
  /** Where a click on the shot goes, when it should go anywhere. */
  href?: string;
  /**
   * Where a click opens the bundle itself, in a new tab. Clicking the picture
   * of a thing to see the thing is the first move anyone makes, so the shot
   * takes it rather than sitting inert beside a button.
   */
  openHref?: string;
  label: string;
  /** Truth that stays legible even when the framed page is almost blank. */
  facts: ReactNode;
  children: ReactNode;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const node = holder.current;
    if (!node || !src) return;

    // The slot is fluid, so the scale is measured rather than guessed. The
    // frame's own height follows from it, which keeps one shape for the wide
    // slot on the bundle page and the card in the grid.
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const scale = rect.width / PREVIEW_WIDTH[width];
      setBox({ scale, height: Math.round(rect.height / scale) });
    };
    measure();

    const resize = new ResizeObserver(measure);
    resize.observe(node);

    if (typeof IntersectionObserver !== "function") {
      setNear(true);
      return () => resize.disconnect();
    }

    let arrived = false;
    const arrive = () => {
      if (arrived) return;
      arrived = true;
      if (!expiresAt || Date.now() < expiresAt) setNear(true);
      watcher.disconnect();
      window.removeEventListener("scroll", onScroll);
    };

    // A scroll that jumps, from dragging the bar or pressing End, can carry a
    // card past the viewport between two frames. The observer samples at frame
    // boundaries, so it never sees that card intersect and the preview would
    // sit on its placeholder for good. Measured: three cards of twenty.
    //
    // So the rect is checked on scroll too, and the test is only the lower
    // edge: anything the reader has already reached or gone past counts as
    // arrived. Cards still below the furthest point reached stay unmounted,
    // which is the whole point of not loading fifty bundles at once.
    const onScroll = () => {
      if (node.getBoundingClientRect().top < window.innerHeight + LOOKAHEAD_PX) arrive();
    };

    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) arrive();
      },
      { rootMargin: `${LOOKAHEAD_PX}px` },
    );
    watcher.observe(node);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      resize.disconnect();
      watcher.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [src, expiresAt, width]);

  return (
    <div className={`${className} shot`} ref={holder} {...(loaded ? { "data-live": "" } : {})}>
      <span className="shot-art" aria-hidden="true">
        {children}
      </span>
      {src && near && box ? (
        <iframe
          className="shot-frame"
          src={src}
          title={label}
          sandbox="allow-scripts"
          loading="lazy"
          referrerPolicy="no-referrer"
          scrolling="no"
          tabIndex={-1}
          aria-hidden="true"
          onLoad={() => setLoaded(true)}
          style={{
            width: `${PREVIEW_WIDTH[width]}px`,
            height: `${box.height}px`,
            transform: `scale(${box.scale})`,
          }}
        />
      ) : null}
      <span className="shot-facts" aria-hidden="true">
        {facts}
      </span>
      {href ? <Link className="shot-hit" href={href} aria-hidden="true" tabIndex={-1} /> : null}
      {openHref ? (
        <a className="shot-open" href={openHref} target="_blank" rel="noreferrer">
          <span>open bundle &#8599;</span>
        </a>
      ) : null}
    </div>
  );
}
