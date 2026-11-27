import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as ready } from "@/app/internal/deploy/ready/route";
import { GET as smoke } from "@/app/internal/deploy/smoke/route";
import { privateRequest } from "./support";
import { useTempDataDir } from "./test-fixtures";

const ORIGIN = "http://localhost:3000";
let dataDir: string;

beforeAll(async () => {
  dataDir = await useTempDataDir();
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("deploy smoke as the first request", () => {
  it("observes an absent data directory without creating it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-absent-"));
    const absent = path.join(root, "volume");
    process.env.HOSTI_DATA_DIR = absent;
    try {
      const first = await smoke(privateRequest(`${ORIGIN}/internal/deploy/smoke`));
      expect(first.status).toBe(503);
      expect(await first.json()).toEqual({ ok: false, writer: false, schema: "4", bundles: 0 });
      expect(existsSync(absent)).toBe(false);
    } finally {
      process.env.HOSTI_DATA_DIR = dataDir;
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("observes an empty volume without creating or claiming anything", async () => {
    const first = await smoke(privateRequest(`${ORIGIN}/internal/deploy/smoke`));
    expect(first.status).toBe(503);
    expect(await first.json()).toEqual({ ok: false, writer: false, schema: "4", bundles: 0 });
    expect(await fs.readdir(dataDir)).toEqual([]);

    const readiness = await ready(privateRequest(`${ORIGIN}/internal/deploy/ready`));
    expect(await readiness.json()).toMatchObject({ ready: true, writer: true, schema: "4" });
    const warm = await smoke(privateRequest(`${ORIGIN}/internal/deploy/smoke`));
    expect(warm.status).toBe(200);
    expect((await fs.readdir(dataDir)).sort()).toContain("hosti.db");
  });
});
