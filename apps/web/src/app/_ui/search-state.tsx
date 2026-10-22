"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { hasQuery, rankTitles } from "@/app/_ui/fuzzy";
import { searchQuery } from "@/app/_ui/search-query";

type Item = { slug: string; title: string };

type Search = {
  query: string;
  setQuery: (query: string) => void;
  searching: boolean;
  total: number;
  slugs: string[];
  titles: ReadonlyMap<string, string>;
  marks: ReadonlyMap<string, readonly number[]>;
  index: number;
  active: string | null;
  step: (down: boolean) => void;
  dropHighlight: () => void;
};

const SearchContext = createContext<Search | null>(null);

export function SearchProvider({ items, children }: { items: Item[]; children: ReactNode }) {
  const query = useSyncExternalStore(searchQuery.subscribe, searchQuery.get, searchQuery.getServer);
  const [index, setIndex] = useState(-1);

  const ranked = useMemo(() => rankTitles(query, items), [query, items]);
  const slugs = useMemo(() => ranked.map((row) => row.item.slug), [ranked]);
  const count = slugs.length;

  const setQuery = useCallback((next: string) => {
    searchQuery.set(next);
    // The list is about to change under the highlight.
    setIndex(-1);
  }, []);
  const step = useCallback(
    (down: boolean) => {
      if (count === 0) return;
      setIndex((at) => (at < 0 ? (down ? 0 : count - 1) : (at + (down ? 1 : -1) + count) % count));
    },
    [count],
  );
  const dropHighlight = useCallback(() => setIndex(-1), []);

  const value = useMemo<Search>(
    () => ({
      query,
      setQuery,
      searching: hasQuery(query),
      total: items.length,
      slugs,
      titles: new Map(items.map((item) => [item.slug, item.title])),
      marks: new Map(ranked.map((row) => [row.item.slug, row.match.positions])),
      index,
      active: index >= 0 ? (slugs[index] ?? null) : null,
      step,
      dropHighlight,
    }),
    [query, setQuery, items, slugs, ranked, index, step, dropHighlight],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): Search {
  const value = useContext(SearchContext);
  if (!value) throw new Error("useSearch needs a SearchProvider");
  return value;
}
