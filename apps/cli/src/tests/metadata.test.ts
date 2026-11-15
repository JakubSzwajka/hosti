import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeStub } from "./stub-server.ts";

const stub = makeStub();
let contentDir: string;

beforeAll(async () => {
  await stub.start();
  contentDir = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-metadata-"));
  await fs.writeFile(path.join(contentDir, "index.html"), "<h1>fixture</h1>");
});

afterAll(async () => {
  await stub.stop();
  await fs.rm(contentDir, { recursive: true, force: true });
});

describe("push metadata over HTTP", () => {
  it("sends Unicode title and collection through the real CLI HTTP boundary", async () => {
    const result = await stub.hosti([
      "push",
      contentDir,
      "--slug",
      "atlas",
      "--title",
      "Raport: zażółć gęślą jaźń 🚀",
      "--collection",
      "résultats",
    ]);

    expect(result.code, result.stderr).toBe(0);
    expect(stub.lastPushMetadata()).toEqual({
      title: "Raport: zażółć gęślą jaźń 🚀",
      collection: "résultats",
    });
  });

  it.each(["Quarterly 100%20", "utf8:%41", "utf8:%FF", "utf8:100%"])(
    "keeps legacy ASCII metadata %s literal over HTTP",
    async (title) => {
      const result = await stub.hosti([
        "push",
        contentDir,
        "--slug",
        "atlas",
        "--title",
        title,
        "--collection",
        "reports%2F2026",
      ]);

      expect(result.code, result.stderr).toBe(0);
      expect(stub.lastPushMetadata()).toEqual({
        title,
        collection: "reports%2F2026",
      });
    },
  );
});
