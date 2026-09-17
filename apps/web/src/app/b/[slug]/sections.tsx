import { COLLECTION_RULE } from "@hosti/shared";
import { CopyButton } from "@/app/_ui/copy-button";
import { formatDate } from "@/app/_ui/format";

/**
 * The two panels on the bundle page that change who can reach a bundle: the
 * share links it has, and the collection it sits in. Split out of `page.tsx`
 * so neither file fights the line cap.
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
  const bare = links.length === 0;
  return (
    <section className="sect" id="share" {...(bare ? { "data-private": "" } : {})}>
      <h3>Share links</h3>
      {refusal ? <p className="error">{refusal}</p> : null}
      {bare ? (
        <p className="note">
          This bundle is private. Nothing at <span className="mono">/v/{slug}/</span> answers until
          you create a share link.
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
        <label>
          <input type="checkbox" name="unlisted" value="1" />
          unlisted, eight random characters on the end
        </label>
        <label>
          pin
          <input
            className="pin-field"
            type="text"
            name="pin"
            inputMode="numeric"
            maxLength={8}
            autoComplete="off"
            placeholder="optional"
          />
        </label>
      </form>
      <p className="note">
        A pin is four to eight digits and it is yours to choose. Hosti hashes it, so nobody can read
        it back here; to change one, type a new one.
      </p>
    </section>
  );
}

function ShareLinkRow({ slug, link, token }: { slug: string; link: Link; token: string }) {
  return (
    <div className="link-card">
      <p className="path">{link.url}</p>
      <p className="props">
        <span>{link.slug === slug ? "bundle slug" : "unlisted"}</span>
        <span>created {formatDate(link.createdAt)}</span>
        <span data-pin={link.hasPin ? "" : undefined}>{link.hasPin ? "pin set" : "no pin"}</span>
      </p>
      <span className="acts">
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
      </span>
      <PinControls slug={slug} link={link} token={token} />
    </div>
  );
}

/** Set, replace or remove one link's PIN. The digits are never shown back. */
function PinControls({ slug, link, token }: { slug: string; link: Link; token: string }) {
  return (
    <span className="pin-row">
      <form method="post" action={`/b/${slug}/share-links/pin`}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="shareSlug" value={link.slug} />
        <input
          className="pin-field"
          type="text"
          name="pin"
          inputMode="numeric"
          maxLength={8}
          autoComplete="off"
          aria-label={link.hasPin ? `replace the pin on ${link.slug}` : `set a pin on ${link.slug}`}
          placeholder="4 to 8 digits"
        />
        <button className="btn" type="submit">
          {link.hasPin ? "replace pin" : "set pin"}
        </button>
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
    </span>
  );
}

/**
 * Set, change or clear the bundle's collection. A collection is a flat label,
 * so this is one text field: type a name that exists, type a new one, or drop
 * the bundle out of every collection.
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
  return (
    <section className="sect">
      <h3>Collection</h3>
      {refused === "bad_collection" ? <p className="error">{COLLECTION_RULE}.</p> : null}
      <div className="set-collection">
        <form className="set-collection" method="post" action={`/b/${slug}/collection`}>
          <input type="hidden" name="token" value={token} />
          <label>
            in
            <input
              name="collection"
              defaultValue={collection ?? ""}
              list={`collections-${slug}`}
              maxLength={64}
              autoComplete="off"
              placeholder="no collection"
              aria-label={`collection for ${slug}`}
            />
          </label>
          <datalist id={`collections-${slug}`}>
            {others.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button className="btn" type="submit">
            save
          </button>
        </form>
        {collection ? (
          <form method="post" action={`/b/${slug}/collection`}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="clear" value="1" />
            <button className="btn" type="submit" data-tone="danger">
              clear it
            </button>
          </form>
        ) : null}
      </div>
      <p className="note">
        A collection is a flat label, never a directory, and a bundle sits in zero or one. Clearing
        it moves this bundle to <span className="mono">no collection</span>.
      </p>
    </section>
  );
}
