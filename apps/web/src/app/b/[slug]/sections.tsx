import { COLLECTION_RULE } from "@hosti/shared";
import { CopyButton } from "@/app/_ui/copy-button";
import { formatDate } from "@/app/_ui/format";

/**
 * The two sections on the bundle page that change who can reach a bundle: the
 * share links it has, and the collection it sits in. Split out of `page.tsx`
 * so neither file fights the line cap.
 *
 * Both hide their less-used controls behind a `<details>`, which is a browser
 * affordance rather than a script: these pages post forms and work with no
 * JavaScript, and the toggle has to do the same.
 */

const SHARE_REFUSALS: Record<string, string> = {
  share_link_exists:
    "A link with that slug already exists. Revoke it, or ask for an unlisted link.",
  slug_too_long: "An unlisted link would push the slug past 64 characters.",
  bad_pin: "A pin is four to eight digits and nothing else.",
  not_configured: "Set HOSTI_SECRET in the environment before a link can carry a pin.",
};

type Link = { slug: string; url: string; createdAt: string; hasPin: boolean };

export function ShareLinks({
  slug,
  links,
  token,
  refused,
}: {
  slug: string;
  links: Link[];
  token: string;
  refused?: string;
}) {
  const refusal = refused ? SHARE_REFUSALS[refused] : undefined;
  return (
    <section className="sect">
      <h3>Share links</h3>
      {refusal ? <p className="error">{refusal}</p> : null}
      {links.length === 0 ? (
        <p className="state" id="share-state">
          Private. Nothing at <span className="mono">/v/{slug}/</span> answers.
        </p>
      ) : null}
      {links.map((link) => (
        <ShareLinkRow key={link.slug} slug={slug} link={link} token={token} />
      ))}
      <form className="make-link" method="post" action={`/b/${slug}/share-links`}>
        <input type="hidden" name="token" value={token} />
        <button className="btn" type="submit">
          create share link
        </button>
        <details className="disclose">
          <summary>options</summary>
          <div className="disclose-body">
            <label className="opt">
              <input type="checkbox" name="unlisted" value="1" />
              unlisted, eight random characters
            </label>
            <label className="opt">
              pin
              <input
                className="pin-field"
                type="text"
                name="pin"
                inputMode="numeric"
                maxLength={8}
                autoComplete="off"
                placeholder="4 to 8 digits"
              />
              <span className="hint">hashed, never shown again</span>
            </label>
          </div>
        </details>
      </form>
    </section>
  );
}

function ShareLinkRow({ slug, link, token }: { slug: string; link: Link; token: string }) {
  return (
    <div className="link">
      <p className="path">{link.url}</p>
      <p className="props">
        <span>{link.slug === slug ? "bundle slug" : "unlisted"}</span>
        <span className="dot">&middot;</span>
        <span>{formatDate(link.createdAt)}</span>
      </p>
      <div className="acts">
        <CopyButton value={link.url} />
        <a className="btn" href={link.url} target="_blank" rel="noreferrer">
          open as a guest
        </a>
        <form method="post" action={`/b/${slug}/share-links/revoke`}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="shareSlug" value={link.slug} />
          <button className="btn" type="submit" data-tone="danger">
            revoke
          </button>
        </form>
      </div>
      <PinControls slug={slug} link={link} token={token} />
    </div>
  );
}

/**
 * Set, replace or remove one link's PIN. The summary states which of the two
 * this link is in, so the state is on the page without a separate line saying
 * it. The digits are never shown back, because Hosti holds only a hash.
 */
function PinControls({ slug, link, token }: { slug: string; link: Link; token: string }) {
  return (
    <details className="disclose">
      <summary {...(link.hasPin ? { "data-on": "" } : {})}>
        {link.hasPin ? "pin set" : "no pin"}
      </summary>
      <div className="disclose-body">
        <form className="pin-row" method="post" action={`/b/${slug}/share-links/pin`}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="shareSlug" value={link.slug} />
          <input
            className="pin-field"
            type="text"
            name="pin"
            inputMode="numeric"
            maxLength={8}
            autoComplete="off"
            aria-label={
              link.hasPin ? `replace the pin on ${link.slug}` : `set a pin on ${link.slug}`
            }
            placeholder="4 to 8 digits"
          />
          <button className="btn" type="submit">
            {link.hasPin ? "replace pin" : "set pin"}
          </button>
          <span className="hint">hashed, never shown again</span>
        </form>
        {link.hasPin ? (
          <form method="post" action={`/b/${slug}/share-links/pin`}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="shareSlug" value={link.slug} />
            <input type="hidden" name="remove" value="1" />
            <button className="btn" type="submit" data-tone="danger">
              remove pin
            </button>
          </form>
        ) : null}
      </div>
    </details>
  );
}

/**
 * Set, change or clear the bundle's collection. A collection is a flat label,
 * so this is one text field and one rule: what you type is saved, and an empty
 * field takes the bundle out of every collection. A form whose only field is
 * text submits on Enter with no script and no button.
 */
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
