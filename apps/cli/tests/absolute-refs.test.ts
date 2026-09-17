import path from "node:path";
import { describe, expect, it } from "vitest";
import { findAbsoluteRefs, scanForAbsoluteRefs } from "../src/absolute-refs.ts";
import { collectFiles } from "../src/pack.ts";
import { warnAbsoluteRefs } from "../src/output.ts";

const FIXTURE = path.resolve(import.meta.dirname, "../../../fixtures/root-absolute");

describe("the four kinds of reference", () => {
  it("catches href, src, srcset and CSS url() in one file", async () => {
    const refs = await scanForAbsoluteRefs(FIXTURE, ["index.html"]);
    expect(refs.map((ref) => ref.snippet)).toEqual([
      '<link rel="stylesheet" href="/assets/atlas.css" />',
      "url(/assets/paper.png)",
      '<img src="/assets/logo.png" alt="logo" />',
      '<img srcset="/assets/wide.png 2x, small.png 1x" src="small.png" alt="chart" />',
    ]);
  });

  it("names the file and the line", async () => {
    const refs = await scanForAbsoluteRefs(FIXTURE, await collectFiles(FIXTURE));
    expect(refs).toContainEqual({
      file: "about.html",
      line: 4,
      snippet: '<script src="/assets/nav.js">',
    });
    expect(refs.find((ref) => ref.file === "index.html")?.line).toBe(6);
  });

  it("leaves relative links and other origins alone", () => {
    const html = [
      '<a href="athletes/">a</a>',
      '<a href="//example.com/x">b</a>',
      '<a href="https://example.com/x">c</a>',
      '<script src="assets/chart.js"></script>',
      "<style>body { background: url('assets/fine.png'); }</style>",
    ].join("\n");
    expect(findAbsoluteRefs(html, "index.html")).toEqual([]);
  });

  it("reads an unquoted attribute and a single-quoted one", () => {
    const refs = findAbsoluteRefs("<img src=/a.png><link href='/b.css'>", "index.html");
    expect(refs).toHaveLength(2);
  });

  it("only flags a srcset candidate that starts at the root", () => {
    expect(findAbsoluteRefs('<img srcset="wide.png 2x, small.png 1x">', "i.html")).toEqual([]);
    expect(findAbsoluteRefs('<img srcset="wide.png 2x, /small.png 1x">', "i.html")).toHaveLength(1);
  });

  it("skips files that are not HTML", async () => {
    expect(await scanForAbsoluteRefs(FIXTURE, ["styles.css"])).toEqual([]);
  });
});

describe("the warning an agent reads", () => {
  it("counts them, points at each one and says how to push anyway", async () => {
    const lines: string[] = [];
    const refs = await scanForAbsoluteRefs(FIXTURE, await collectFiles(FIXTURE));
    warnAbsoluteRefs((line) => lines.push(line), refs, "repo-atlas");

    expect(lines[0]).toBe("warning  5 root-absolute references will 404 under /v/repo-atlas/");
    expect(lines[1]).toContain("about.html:4");
    expect(lines.at(-1)).toContain("--allow-absolute");
    expect(lines).toHaveLength(refs.length + 2);
  });

  it("says nothing when the bundle is clean", () => {
    const lines: string[] = [];
    warnAbsoluteRefs((line) => lines.push(line), [], "clean");
    expect(lines).toEqual([]);
  });
});
