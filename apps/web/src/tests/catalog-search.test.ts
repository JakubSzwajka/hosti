import { describe, expect, it } from "vitest";
import { fuzzyMatch, hasQuery, highlightParts, rankTitles } from "@/app/_ui/fuzzy";

const TITLES = [
  "Mac Construction - Contract Pack",
  "Blocks pricing sketch",
  "Pi Durable, agents only: who runs where",
  "Blocks on autopilot",
  "Blocks backend: capability and feature map",
  "Pi Durable, explained: the planned always-on agent host",
  "agent-dev-kit on Pi",
  "Blocks screen map",
  "agent dev loop, timed",
  "agent-dev-kit: the idea and the workflow",
  "Who can do what on Blocks Enterprise",
  "Pipeline durability notes",
  "Where the delegate lanes spent money and time",
  "The life of one intercom message",
  "Secrets, in transit",
  "Agents, set up end to end",
  "agent runs, daily review",
  "Inbox zero prototype",
  "Pi over SSH, from a phone",
  "Otter UI, Polish pass",
  "Blocks onboarding copy",
  "No-noise letter",
  "Product updates, round two",
  "PubNub live board",
  "Offerlink pitch",
  "Backlog clean-up, weeks 3-4",
  "Trippy, one",
  "Orphan draft (no revision yet)",
  "Pi cost model, per agent hour",
  "Secrets rotation drill",
  "Blocks mobile nav, three ways",
  "Agent memory, what sticks",
  "Trippy, two",
  "PubNub presence check",
  "Offerlink deck, second cut",
  "Piano roll experiment",
  "Durable queues compared",
  "Pi Durable, first draft",
  "House style for reports",
  "agent handoff format",
  "Blocks dev environment, from zero",
  "Weekly numbers, September",
  "Otter UI, English pass",
  "Ledger export check",
  "Dev agent glossary",
  "Status page ideas",
];
const BUNDLES = TITLES.map((title, index) => ({ slug: `b${index}`, title }));

function top(query: string, count = 3): string[] {
  return rankTitles(query, BUNDLES)
    .slice(0, count)
    .map((row) => row.item.title);
}

function marked(title: string, query: string): string {
  const match = fuzzyMatch(query, title);
  if (!match) throw new Error(`no match for ${query}`);
  return highlightParts(title, match.positions)
    .map((part) => (part.hit ? `[${part.text}]` : part.text))
    .join("");
}

describe("fuzzyMatch", () => {
  it("ignores case in the query and the title", () => {
    expect(fuzzyMatch("BLOCKS", "Blocks pricing sketch")).toEqual(
      fuzzyMatch("blocks", "BLOCKS PRICING SKETCH"),
    );
    expect(fuzzyMatch("blocks", "Blocks pricing sketch")).not.toBeNull();
  });

  it("ignores spaces in the query", () => {
    const spaced = fuzzyMatch("agt dev", "agent-dev-kit on Pi");
    expect(spaced).not.toBeNull();
    expect(spaced).toEqual(fuzzyMatch("agtdev", "agent-dev-kit on Pi"));
    expect(fuzzyMatch("  a g  ", "agent")).toEqual(fuzzyMatch("ag", "agent"));
  });

  it("needs every query character, in order", () => {
    expect(fuzzyMatch("dp", "Pi Durable")).toBeNull();
    expect(fuzzyMatch("pd", "Pi Durable")).not.toBeNull();
    expect(fuzzyMatch("ppp", "Pi Durable")).toBeNull();
    expect(fuzzyMatch("xyz", "Blocks pricing sketch")).toBeNull();
    expect(fuzzyMatch("toolongquery", "short")).toBeNull();
  });

  it("matches only titles, never anything else", () => {
    const bundle = { slug: "adk-pi-quickstart", title: "agent-dev-kit on Pi" };
    expect(rankTitles("quick", [bundle])).toEqual([]);
  });

  it("matches an empty or blank query to everything with no highlight", () => {
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, positions: [] });
    expect(fuzzyMatch("   ", "anything")).toEqual({ score: 0, positions: [] });
    expect(hasQuery("")).toBe(false);
    expect(hasQuery("  ")).toBe(false);
    expect(hasQuery(" a ")).toBe(true);
    expect(rankTitles("  ", BUNDLES).map((row) => row.item.slug)).toEqual(
      BUNDLES.map((bundle) => bundle.slug),
    );
  });

  it("picks the best alignment, not the first letters it finds", () => {
    // The first p and d sit in "Pipeline durability"'s neighbours. The run in "Pi Durable" wins.
    expect(marked("Pi Durable, first draft", "pdur")).toBe("[P]i [Dur]able, first draft");
    expect(marked("Blocks screen map", "blocks")).toBe("[Blocks] screen map");
  });

  it("scores consecutive characters and word starts the same", () => {
    // Only the skipped space (0.4) separates a run from a word start.
    const run = fuzzyMatch("ab", "ab");
    const hop = fuzzyMatch("ab", "a b");
    expect(run?.score).toBe(24);
    expect(hop?.score).toBe(23.6);
  });

  it("gives the title start a bonus", () => {
    const start = fuzzyMatch("blocks", "Blocks pricing sketch");
    const later = fuzzyMatch("blocks", "Who can do what on Blocks Enterprise");
    expect(start?.score).toBeGreaterThan(later?.score ?? 0);
  });

  it("penalises gaps a little", () => {
    const tight = fuzzyMatch("ab", "ab");
    const loose = fuzzyMatch("ab", "a--b");
    expect(tight?.score).toBeGreaterThan(loose?.score ?? 0);
    const far = fuzzyMatch("ab", `a${"-".repeat(40)}b`);
    const capped = fuzzyMatch("ab", `a${"-".repeat(30)}b`);
    expect(far?.score).toBe(capped?.score);
  });

  it("returns ascending positions and counts characters, not UTF-16 units", () => {
    const match = fuzzyMatch("pd", "Pi Durable");
    expect(match?.positions).toEqual([0, 3]);
    expect(fuzzyMatch("b", "🙂 Blocks")?.positions).toEqual([2]);
  });
});

describe("rankTitles", () => {
  it("ranks pdur: three Pi Durable titles first, then the loose tail", () => {
    const ranked = rankTitles("pdur", BUNDLES);
    expect(ranked).toHaveLength(7);
    expect(top("pdur")).toEqual([
      "Pi Durable, agents only: who runs where",
      "Pi Durable, explained: the planned always-on agent host",
      "Pi Durable, first draft",
    ]);
    // Known loose match from the prototype record. A minimum score is a later decision.
    expect(ranked.at(-1)?.item.title).toBe("Blocks backend: capability and feature map");
  });

  it("ranks BLOCKS: nine matches, seven Blocks titles tie in catalog order", () => {
    const ranked = rankTitles("BLOCKS", BUNDLES);
    expect(ranked).toHaveLength(9);
    expect(top("BLOCKS", 7)).toEqual([
      "Blocks pricing sketch",
      "Blocks on autopilot",
      "Blocks backend: capability and feature map",
      "Blocks screen map",
      "Blocks onboarding copy",
      "Blocks mobile nav, three ways",
      "Blocks dev environment, from zero",
    ]);
    expect(new Set(ranked.slice(0, 7).map((row) => row.match.score)).size).toBe(1);
  });

  it('ranks "agt dev": four matches with agent-dev-kit on Pi first', () => {
    expect(rankTitles("agt dev", BUNDLES)).toHaveLength(4);
    expect(top("agt dev")).toEqual([
      "agent-dev-kit on Pi",
      "agent dev loop, timed",
      "agent-dev-kit: the idea and the workflow",
    ]);
  });

  it("returns nothing for xyz", () => {
    expect(rankTitles("xyz", BUNDLES)).toEqual([]);
  });

  it("keeps catalog order for equal scores and sorts the rest by score", () => {
    const items = [
      { title: "zz Blocks" },
      { title: "Blocks one" },
      { title: "Blocks two" },
      { title: "Blocks three" },
    ];
    expect(rankTitles("blocks", items).map((row) => row.item.title)).toEqual([
      "Blocks one",
      "Blocks two",
      "Blocks three",
      "zz Blocks",
    ]);
  });
});

describe("highlightParts", () => {
  it("joins adjacent matches into one run", () => {
    expect(marked("Blocks pricing sketch", "BLOCKS")).toBe("[Blocks] pricing sketch");
    expect(marked("agent-dev-kit on Pi", "agt dev")).toBe("[ag]en[t]-[dev]-kit on Pi");
  });

  it("returns the whole title as one plain run without positions", () => {
    expect(highlightParts("Plain title", [])).toEqual([
      { text: "Plain title", hit: false, start: 0 },
    ]);
  });

  it("rebuilds the exact title from its runs", () => {
    for (const title of TITLES) {
      const match = fuzzyMatch("e", title);
      const text = highlightParts(title, match?.positions ?? [])
        .map((part) => part.text)
        .join("");
      expect(text).toBe(title);
    }
  });
});
