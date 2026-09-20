"use client";

import Link from "next/link";
import { useRef } from "react";

export function CollectionPicker({
  slug,
  collection,
  known,
  token,
  creating,
  error,
}: {
  slug: string;
  collection: string | null;
  known: string[];
  token: string;
  creating: boolean;
  error?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const selected = creating ? "__new" : (collection ?? "");

  return (
    <div className="collection-picker">
      <form ref={form} method="post" action={`/b/${slug}/collection`}>
        <input type="hidden" name="token" value={token} />
        <select
          className="collection-select"
          name="collection"
          aria-label={`collection for ${slug}`}
          defaultValue={selected}
          onChange={() => form.current?.requestSubmit()}
        >
          {known.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="">no collection</option>
          <option value="__new">new collection...</option>
        </select>
        <noscript>
          <button className="btn collection-save" type="submit">
            save
          </button>
        </noscript>
      </form>

      {creating ? (
        <form className="new-collection" method="post" action={`/b/${slug}/collection`}>
          <input type="hidden" name="token" value={token} />
          <input
            name="collection"
            maxLength={64}
            autoComplete="off"
            aria-label={`new collection for ${slug}`}
            placeholder="collection name"
            required
          />
          <button className="btn" type="submit">
            save
          </button>
          <Link className="btn" href={`/b/${slug}`}>
            cancel
          </Link>
        </form>
      ) : null}
      {error ? <span className="collection-error">{error}</span> : null}
    </div>
  );
}
