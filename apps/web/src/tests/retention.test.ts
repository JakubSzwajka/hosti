import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./test-fixtures";

const { prune, push } = await import("./api");
const { createPushToken, findBundle, listRevisions, pruneRevisions, bundleDir } = await import(
  "./support"
);
const { DEFAULT_KEEP_REVISIONS } = await import("@/server/config");

let dataDir: string;
let token: string;

beforeAll(async () => {
  dataDir = await useTempDataDir();
  token = createPushToken("test").secret;
});

afterEach(() => {
  delete process.env.HOSTI_KEEP_REVISIONS;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

async function pushTimes(slug: string, times: number): Promise<void> {
  const body = await tarFixture("single-file");
  for (let n = 0; n < times; n += 1) {
    const response = await push(token, slug, body);
    if (response.status !== 201) throw new Error(`push failed: ${await response.text()}`);
  }
}

function seqsOf(slug: string): number[] {
  const bundle = findBundle(slug);
  return listRevisions(bundle?.id ?? 0).map((revision) => revision.seq);
}

async function dirsOf(slug: string): Promise<string[]> {
  const entries = await fs.readdir(bundleDir(slug));
  return entries.filter((entry) => entry.startsWith("r")).sort();
}

describe("what a push leaves behind", () => {
  it("keeps the newest five and deletes the rest", async () => {
    await pushTimes("churned", 8);

    expect(seqsOf("churned")).toEqual([8, 7, 6, 5, 4]);
    expect(await dirsOf("churned")).toEqual(["r4", "r5", "r6", "r7", "r8"]);
    expect(DEFAULT_KEEP_REVISIONS).toBe(5);
  });

  it("never touches the current revision", async () => {
    await pushTimes("churned", 1);
    const current = listRevisions(findBundle("churned")?.id ?? 0).find(
      (revision) => revision.current,
    );
    expect(current?.seq).toBe(9);

    // The pointer still resolves, so the bundle keeps answering its links.
    const real = await fs.realpath(path.join(bundleDir("churned"), "current"));
    expect(path.basename(real)).toBe("r9");
  });

  it("leaves a bundle alone while it has fewer than the keep count", async () => {
    await pushTimes("young", 3);
    expect(seqsOf("young")).toEqual([3, 2, 1]);
    expect(await dirsOf("young")).toEqual(["r1", "r2", "r3"]);
  });
});

describe("the keep count", () => {
  it("comes from HOSTI_KEEP_REVISIONS", async () => {
    process.env.HOSTI_KEEP_REVISIONS = "2";
    await pushTimes("thrifty", 4);
    expect(seqsOf("thrifty")).toEqual([4, 3]);
    expect(await dirsOf("thrifty")).toEqual(["r3", "r4"]);
  });

  it("never drops below one, so the live revision survives a zero", async () => {
    process.env.HOSTI_KEEP_REVISIONS = "0";
    await pushTimes("bare", 3);
    expect(seqsOf("bare")).toEqual([3]);
    expect(await dirsOf("bare")).toEqual(["r3"]);
  });

  it("falls back to the default when the value is not a number", async () => {
    process.env.HOSTI_KEEP_REVISIONS = "loads";
    await pushTimes("typo", 7);
    expect(seqsOf("typo")).toHaveLength(DEFAULT_KEEP_REVISIONS);
  });
});

describe("pruning on demand", () => {
  it("is safe to run twice and on a bundle nobody has pushed", async () => {
    await pushTimes("repeatable", 6);
    const first = await pruneRevisions("repeatable");
    expect(first.removed).toEqual([]);
    expect(first.kept).toEqual([6, 5, 4, 3, 2]);

    const missing = await pruneRevisions("never-existed");
    expect(missing).toEqual({ kept: [], removed: [] });
  });

  it("removes what an earlier, looser keep count left behind", async () => {
    process.env.HOSTI_KEEP_REVISIONS = "9";
    await pushTimes("tightened", 6);
    expect(seqsOf("tightened")).toHaveLength(6);

    process.env.HOSTI_KEEP_REVISIONS = "2";
    const pruned = await pruneRevisions("tightened");
    expect(pruned.removed.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(pruned.kept).toEqual([6, 5]);
    expect(await dirsOf("tightened")).toEqual(["r5", "r6"]);
  });
});

describe("the prune endpoint", () => {
  it("needs a push token", async () => {
    await pushTimes("guarded", 2);
    const refused = await prune("", "guarded");
    expect(refused.status).toBe(401);

    const wrong = await prune("hosti_not-a-real-token", "guarded");
    expect(wrong.status).toBe(401);
    expect(seqsOf("guarded")).toEqual([2, 1]);
  });

  it("refuses an unknown bundle", async () => {
    const response = await prune(token, "ghost");
    expect(response.status).toBe(404);
  });

  it("reports what it kept and what it took", async () => {
    process.env.HOSTI_KEEP_REVISIONS = "9";
    await pushTimes("on-demand", 6);
    process.env.HOSTI_KEEP_REVISIONS = "3";

    const response = await prune(token, "on-demand");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      bundle: "on-demand",
      keep: 3,
      kept: [6, 5, 4],
      removed: [3, 2, 1],
    });
    expect(await dirsOf("on-demand")).toEqual(["r4", "r5", "r6"]);
  });
});

describe("what pruning refuses to delete", () => {
  it("removes the revision directory and nothing beside it", async () => {
    process.env.HOSTI_KEEP_REVISIONS = "1";
    await pushTimes("tidy", 3);

    const left = await fs.readdir(bundleDir("tidy"));
    expect(left.sort()).toEqual(["current", "r3"]);
  });

  it("leaves the current symlink where it is", async () => {
    process.env.HOSTI_KEEP_REVISIONS = "1";
    await pushTimes("linked", 2);
    await pruneRevisions("linked");

    const link = await fs.lstat(path.join(bundleDir("linked"), "current"));
    expect(link.isSymbolicLink()).toBe(true);
    expect(await fs.readlink(path.join(bundleDir("linked"), "current"))).toBe("r2");
  });
});
