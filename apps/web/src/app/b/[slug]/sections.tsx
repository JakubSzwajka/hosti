import type { SharingState } from "@hosti/shared";
import { COLLECTION_RULE } from "@hosti/shared";
import { CopyButton } from "@/app/_ui/copy-button";

const SHARE_REFUSALS: Record<string, string> = {
  bad_mode: "Pick private, link or pin.",
  bad_pin: "A pin is four to eight digits and nothing else.",
  pin_required: "Type a pin before you put this bundle behind one.",
  pin_not_wanted: "A pin only belongs on the pin state.",
  not_configured: "Set HOSTI_SECRET in the environment before a bundle can carry a pin.",
};

const MODE_NOTES: Record<SharingState["mode"], string> = {
  private: "nothing answers at the share URL",
  link: "anyone holding the URL opens the bundle",
  pin: "the URL asks for the pin, then opens the bundle",
};

export function SharingSection({
  slug,
  sharing,
  url,
  token,
  refused,
}: {
  slug: string;
  sharing: SharingState;
  url: string | null;
  token: string;
  refused?: string;
}) {
  const refusal = refused ? SHARE_REFUSALS[refused] : undefined;
  return (
    <section className="sect">
      <h3>Sharing</h3>
      {refusal ? <p className="error">{refusal}</p> : null}
      {url ? (
        <div className="link">
          <p className="path">{url}</p>
          <div className="acts">
            <CopyButton value={url} />
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              open as a guest
            </a>
          </div>
        </div>
      ) : (
        <p className="state" id="share-state">
          Private. Nothing at <span className="mono">/v/{sharing.shareSlug}/</span> answers.
        </p>
      )}

      <form className="set-sharing" method="post" action={`/b/${slug}/sharing`}>
        <input type="hidden" name="token" value={token} />
        <ul className="modes">
          {(Object.keys(MODE_NOTES) as SharingState["mode"][]).map((mode) => (
            <li key={mode}>
              <label className="opt">
                <input
                  type="radio"
                  name="mode"
                  value={mode}
                  defaultChecked={sharing.mode === mode}
                />
                <b>{mode}</b>
                <span className="hint">{MODE_NOTES[mode]}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="pin-row">
          <input
            className="pin-field"
            type="text"
            name="pin"
            inputMode="numeric"
            maxLength={8}
            autoComplete="off"
            aria-label={sharing.hasPin ? `replace the pin on ${slug}` : `set a pin on ${slug}`}
            placeholder="4 to 8 digits"
          />
          <span className="hint">
            {sharing.hasPin
              ? "pin set, hashed. Type new digits to replace it."
              : "hashed, never shown again"}
          </span>
        </div>
        <button className="btn" type="submit">
          save sharing
        </button>
      </form>

      <form className="rotate" method="post" action={`/b/${slug}/sharing/rotate`}>
        <input type="hidden" name="token" value={token} />
        <button className="btn" type="submit" data-tone="danger">
          rotate link
        </button>
        <span className="hint">
          a fresh address. The old one stops answering for everyone holding it.
        </span>
      </form>
    </section>
  );
}

export function CollectionSection({
  slug,
  collection,
  known,
  token,
  refused,
}: {
  slug: string;
  collection: string | null;
  known: string[];
  token: string;
  refused?: string;
}) {
  const others = known.filter((name) => name !== collection);
  const hintId = `collection-hint-${slug}`;
  return (
    <section className="sect">
      <h3>Collection</h3>
      {refused === "bad_collection" ? <p className="error">{COLLECTION_RULE}.</p> : null}
      <form className="set-collection" method="post" action={`/b/${slug}/collection`}>
        <input type="hidden" name="token" value={token} />
        <input
          name="collection"
          defaultValue={collection ?? ""}
          list={`collections-${slug}`}
          maxLength={64}
          autoComplete="off"
          placeholder="no collection"
          aria-label={`collection for ${slug}`}
          aria-describedby={hintId}
        />
        <datalist id={`collections-${slug}`}>
          {others.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <span className="hint" id={hintId}>
          enter saves, empty clears
        </span>
      </form>
    </section>
  );
}
