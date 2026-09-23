"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";

const PREVIEW_WIDTH = { card: 760, detail: 1100 } as const;

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
  width: keyof typeof PREVIEW_WIDTH;
  src?: string | undefined;
  expiresAt?: number | null | undefined;
  href?: string | undefined;
  openHref?: string | undefined;
  label: string;
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
      {/* Keep bundle scripts from reading catalog cookies. */}
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
