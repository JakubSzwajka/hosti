import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeStub } from "./stub-server.ts";

const stub = makeStub();
const hosti = stub.hosti;
let origin: string;

beforeAll(async () => {
  await stub.start();
  origin = stub.origin();
});

afterAll(async () => {
  await stub.stop();
});

describe("hosti open", () => {
  it("prints the share link, and prints it last", async () => {
    stub.setCatalog([{ slug: "squad-2026", mode: "link", shareSlug: "k7f3n9qpbcdf" }]);
    const result = await hosti(["open", "squad-2026"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("link");
    expect(result.stdout.trim().split("\n").at(-1)).toBe(`${origin}/v/k7f3n9qpbcdf/`);
  });

  it("says the URL asks for a pin when it does", async () => {
    stub.setCatalog([{ slug: "squad-2026", mode: "pin" }]);
    const result = await hosti(["open", "squad-2026"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("pin");
    expect(result.stdout.trim().split("\n").at(-1)).toBe(`${origin}/v/squad-2026/`);
  });

  it("prints the owner-only page for a private bundle", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    const result = await hosti(["open", "atlas"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("private");
    expect(result.stdout.trim().split("\n").at(-1)).toBe(`${origin}/b/atlas`);
  });

  it("fails on a slug the catalog does not carry", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    const result = await hosti(["open", "ghost"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No bundle is called "ghost"');
    expect(result.stdout).toBe("");
  });

  it("wants a slug", async () => {
    const result = await hosti(["open"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("open needs a slug");
  });

  it("refuses --open anywhere else", async () => {
    const result = await hosti(["ls", "--open"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--open means nothing to ls");
  });
});

describe("hosti ls", () => {
  it("names the sharing state in the same three words", async () => {
    stub.setCatalog([
      { slug: "atlas", mode: "private" },
      { slug: "squad", mode: "link" },
      { slug: "sleep", mode: "pin" },
    ]);
    const result = await hosti(["ls"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("sharing");
    expect(result.stdout).toMatch(/atlas .*private .*-/);
    expect(result.stdout).toContain(`${origin}/v/squad/`);
    expect(result.stdout).toContain(`${origin}/v/sleep/`);
  });
});

describe("hosti prune", () => {
  it("says what it kept and what it took away", async () => {
    stub.setPruneAnswer({
      status: 200,
      body: { bundle: "squad-2026", keep: 5, kept: [9, 8, 7, 6, 5], removed: [4, 3, 2, 1] },
    });
    const result = await hosti(["prune", "squad-2026"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("keep     5 newest");
    expect(result.stdout).toContain("kept     9, 8, 7, 6, 5");
    expect(result.stdout).toContain("removed  4, 3, 2, 1");
  });

  it("says nothing was taken away when nothing was", async () => {
    stub.setPruneAnswer({
      status: 200,
      body: { bundle: "atlas", keep: 5, kept: [1], removed: [] },
    });
    const result = await hosti(["prune", "atlas"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("removed  nothing");
  });

  it("exits non-zero with the server's own message", async () => {
    stub.setPruneAnswer({
      status: 404,
      body: { error: "no_such_bundle", message: 'No bundle is called "ghost"' },
    });
    const result = await hosti(["prune", "ghost"]);
    expect(result.code).toBe(1);
    expect(result.stderr.trim().split("\n").at(-1)).toBe('No bundle is called "ghost"');
  });

  it("wants a slug", async () => {
    const result = await hosti(["prune"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("prune needs a slug");
  });
});
