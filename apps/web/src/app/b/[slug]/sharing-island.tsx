"use client";

import type { SharingMode } from "@hosti/shared";
import Link from "next/link";
import { useRef, useState } from "react";
import { CopyButton } from "@/app/_ui/copy-button";

const CHOICES: { mode: SharingMode; label: string }[] = [
  { mode: "private", label: "private" },
  { mode: "link", label: "anyone with the link" },
  { mode: "pin", label: "link and pin" },
];

export function SharingIsland({
  slug,
  mode,
  hasPin,
  liveUrl,
  deadUrl,
  token,
  hasRevision,
  refused,
  replacingPin,
  confirmingRotate,
}: {
  slug: string;
  mode: SharingMode;
  hasPin: boolean;
  liveUrl: string | null;
  deadUrl: string;
  token: string;
  hasRevision: boolean;
  refused?: string | undefined;
  replacingPin: boolean;
  confirmingRotate: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const startsOnPin = refused === "pin_required" || refused === "bad_pin";
  const [selected, setSelected] = useState<SharingMode>(startsOnPin ? "pin" : mode);

  function choose(next: SharingMode): void {
    setSelected(next);
    if (next !== "pin") requestAnimationFrame(() => form.current?.requestSubmit());
  }

  return (
    <section className="share-island" id="sharing">
      <div className="island-head">
        <h3>sharing</h3>
      </div>
      {hasRevision ? (
        <>
          <form ref={form} className="sharing-form" method="post" action={`/b/${slug}/sharing`}>
            <input type="hidden" name="token" value={token} />
            <fieldset>
              <legend className="sr-only">sharing state</legend>
              {refused ? <p className="share-error">{refused}</p> : null}
              {CHOICES.map((choice) => {
                const on = selected === choice.mode;
                const pinChoice = choice.mode === "pin";
                const editingPin = pinChoice && on && (!hasPin || replacingPin || startsOnPin);
                return (
                  <div className="sharing-choice" data-on={on ? "" : undefined} key={choice.mode}>
                    <label>
                      <input
                        type="radio"
                        name="mode"
                        value={choice.mode}
                        checked={on}
                        onChange={() => choose(choice.mode)}
                      />
                      <span>{choice.label}</span>
                    </label>
                    {pinChoice && on ? (
                      <div className="pin-controls">
                        {editingPin ? (
                          <>
                            <input
                              className="pin-field"
                              type="text"
                              name="pin"
                              inputMode="numeric"
                              pattern="[0-9]{4,8}"
                              minLength={4}
                              maxLength={8}
                              autoComplete="off"
                              aria-label={
                                hasPin ? `replace the pin on ${slug}` : `set a pin on ${slug}`
                              }
                              placeholder="4 to 8 digits"
                              required
                            />
                            <button className="btn" type="submit">
                              {hasPin ? "replace pin" : "set pin"}
                            </button>
                            {hasPin ? (
                              <Link className="btn" href={`/b/${slug}#sharing`}>
                                cancel
                              </Link>
                            ) : null}
                            <span className="pin-note">
                              four to eight digits, never shown again
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="pin-stamp">pin set</span>
                            <Link className="btn" href={`/b/${slug}?pin=replace#sharing`}>
                              replace pin
                            </Link>
                            <button className="btn" type="submit" form="remove-pin-form">
                              remove pin
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
            <noscript>
              <div className="share-noscript">
                <button className="btn" type="submit">
                  save sharing
                </button>
              </div>
            </noscript>
          </form>

          <form id="remove-pin-form" method="post" action={`/b/${slug}/sharing`}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="mode" value="link" />
          </form>

          <ShareFoot
            slug={slug}
            mode={mode}
            liveUrl={liveUrl}
            deadUrl={deadUrl}
            token={token}
            confirmingRotate={confirmingRotate}
          />
        </>
      ) : (
        <p className="sharing-empty">sharing starts after the first revision lands.</p>
      )}
    </section>
  );
}

function ShareFoot({
  slug,
  mode,
  liveUrl,
  deadUrl,
  token,
  confirmingRotate,
}: {
  slug: string;
  mode: SharingMode;
  liveUrl: string | null;
  deadUrl: string;
  token: string;
  confirmingRotate: boolean;
}) {
  if (confirmingRotate && mode !== "private") {
    return (
      <div className="island-foot share-foot" data-confirm="">
        <p>the address changes. the old one stops answering for everyone who already has it.</p>
        <div className="share-actions">
          <Link className="btn" href={`/b/${slug}#sharing`}>
            cancel
          </Link>
          <form method="post" action={`/b/${slug}/sharing/rotate`}>
            <input type="hidden" name="token" value={token} />
            <button className="btn" type="submit" data-tone="danger">
              yes, rotate
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (mode === "private" || !liveUrl) {
    return (
      <div className="island-foot share-foot">
        <p className="share-url" data-dead="">
          {deadUrl}
        </p>
      </div>
    );
  }

  return (
    <div className="island-foot share-foot">
      <p className="share-url">{liveUrl}</p>
      <div className="share-actions">
        <CopyButton value={liveUrl} label="copy" />
        <Link className="btn" href={`/b/${slug}?rotate=1#sharing`}>
          rotate link
        </Link>
      </div>
    </div>
  );
}
