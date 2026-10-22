import { describe, expect, it, vi } from "vitest";
import { searchQuery } from "@/app/_ui/search-query";
import { isComposingKey } from "@/app/_ui/search-field";

describe("search query store", () => {
  it("keeps the query for the next reader and tells subscribers", () => {
    const seen = vi.fn();
    const stop = searchQuery.subscribe(seen);
    searchQuery.set("blocks");
    searchQuery.set("blocks");
    expect(seen).toHaveBeenCalledTimes(1);
    // A page that mounts after navigation reads the kept query on first render.
    expect(searchQuery.get()).toBe("blocks");
    stop();
    searchQuery.set("");
    expect(seen).toHaveBeenCalledTimes(1);
    expect(searchQuery.get()).toBe("");
  });

  it("never gives the server a query", () => {
    searchQuery.set("secret");
    expect(searchQuery.getServer()).toBe("");
    searchQuery.set("");
  });
});

describe("IME guard", () => {
  it("flags composing and keyCode 229 events", () => {
    expect(isComposingKey({ nativeEvent: { isComposing: true } })).toBe(true);
    expect(isComposingKey({ keyCode: 229, nativeEvent: { isComposing: false } })).toBe(true);
    expect(isComposingKey({ keyCode: 13, nativeEvent: { isComposing: false } })).toBe(false);
  });
});
