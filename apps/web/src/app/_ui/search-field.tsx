"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { useSearch } from "@/app/_ui/search-state";

function takesTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable], .drop") !== null
  );
}

export function isComposingKey(event: {
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean };
}): boolean {
  return event.nativeEvent?.isComposing === true || event.keyCode === 229;
}

export function SearchField() {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const search = useSearch();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      const field = input.current;
      if (!field) return;
      const slash = event.key === "/" && !event.ctrlKey && !event.metaKey;
      const palette = event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey);
      if (!slash && !palette) return;
      if (event.target === field) {
        // A slash in the field is text. Ctrl or Cmd-K there only selects it.
        if (slash) return;
      } else if (takesTyping(event.target)) {
        return;
      }
      event.preventDefault();
      field.focus();
      field.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Keys that confirm or cancel IME text are not commands. 229 covers Safari.
    if (isComposingKey(event)) return;
    if (event.key === "Escape") {
      // First Esc drops the highlight, the next clears the query. Focus stays.
      event.preventDefault();
      if (search.active !== null) search.dropHighlight();
      else if (search.query !== "") search.setQuery("");
      return;
    }
    if (!search.searching) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      search.step(event.key === "ArrowDown");
    } else if (event.key === "Enter") {
      event.preventDefault();
      const slug = search.active ?? search.slugs[0];
      if (slug) router.push(`/b/${slug}`);
    }
  }

  const count = `${search.slugs.length} of ${search.total}`;
  const heard =
    search.active === null
      ? ""
      : `Highlighted ${search.titles.get(search.active) ?? search.active}, ${search.index + 1} of ${search.slugs.length}`;

  return (
    <div className="find" {...(search.searching ? { "data-active": "" } : {})}>
      <label className="sr-only" htmlFor={id}>
        Search bundle titles
      </label>
      <svg className="find-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        ref={input}
        id={id}
        className="find-input"
        type="search"
        value={search.query}
        placeholder="search titles"
        autoComplete="off"
        spellCheck={false}
        aria-keyshortcuts="/ Control+K Meta+K"
        aria-controls="catalog-hits"
        {...(search.active ? { "aria-activedescendant": `hit-${search.active}` } : {})}
        onChange={(event) => search.setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={search.dropHighlight}
      />
      {search.query === "" ? (
        <span className="find-kbd" aria-hidden="true">
          /
        </span>
      ) : null}
      <span className="find-count" aria-live="polite">
        {search.searching ? count : ""}
      </span>
      <span className="sr-only" aria-live="polite">
        {heard}
      </span>
      {search.query === "" ? null : (
        <button
          type="button"
          className="find-x"
          aria-label="Clear search"
          onClick={() => {
            search.setQuery("");
            input.current?.focus();
          }}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path
              d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
