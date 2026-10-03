import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOARD_APP_HASH, BOARD_APP_PASSWORD } from "./owner-hash-vector";
import { useTempDataDir } from "./test-fixtures";

const { verifyOwnerPassword } = await import("./support");

let dataDir: string;

beforeAll(async () => {
  dataDir = await useTempDataDir();
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

const SCRIPT = path.resolve(import.meta.dirname, "../../scripts/owner-hash.mjs");
const SHAPE = /^scrypt:16384:8:1:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/;

function run(input: string) {
  return spawnSync(process.execPath, [SCRIPT], { input, encoding: "utf8" });
}

describe("pnpm owner:hash", () => {
  it("reads the password from stdin and prints only the hash on stdout", () => {
    const result = run("correct horse battery");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^scrypt:[^\n]+\n$/);
    expect(result.stdout.trim()).toMatch(SHAPE);
    expect(result.stderr).toBe("");
  });

  it("makes a hash that verifies through @hosti/identity, and only for that password", async () => {
    const hash = run("correct horse battery\n").stdout.trim();
    expect(await verifyOwnerPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyOwnerPassword("correct horse batter", hash)).toBe(false);
  });

  it("strips one trailing newline and no more", async () => {
    const withCrlf = run("correct horse battery\r\n").stdout.trim();
    expect(await verifyOwnerPassword("correct horse battery", withCrlf)).toBe(true);
    const withTwo = run("correct horse battery\n\n").stdout.trim();
    expect(await verifyOwnerPassword("correct horse battery\n", withTwo)).toBe(true);
  });

  it("salts every hash", () => {
    expect(run("correct horse battery").stdout).not.toBe(run("correct horse battery").stdout);
  });

  it("refuses a password shorter than 8 characters, on stderr, with no hash", () => {
    for (const input of ["", "\n", "short", "1234567\n"]) {
      const result = run(input);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("at least 8 characters");
    }
    expect(run("12345678").status).toBe(0);
  });

  it("verifies a hash made by board-app's own owner:hash", async () => {
    expect(await verifyOwnerPassword(BOARD_APP_PASSWORD, BOARD_APP_HASH)).toBe(true);
  });
});
