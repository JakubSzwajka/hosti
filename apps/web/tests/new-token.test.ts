import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(import.meta.dirname, "../scripts/new-token.mjs");

let dataDir: string;

function mint(...args: string[]): string {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, HOSTI_DATA_DIR: dataDir },
    encoding: "utf8",
  });
}

function scopesOf(secret: string): string | undefined {
  const database = new Database(path.join(dataDir, "hosti.db"), { readonly: true });
  try {
    const digest = createHash("sha256").update(secret, "utf8").digest("hex");
    const row = database.prepare("SELECT scopes FROM push_tokens WHERE token_hash = ?").get(digest);
    return (row as { scopes: string } | undefined)?.scopes;
  } finally {
    database.close();
  }
}

beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-new-token-"));
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("pnpm token:new", () => {
  it("grants publish and share by default", () => {
    const secret = mint("--name", "shell").match(/hosti_[A-Za-z0-9_-]+/)?.[0] ?? "";
    expect(scopesOf(secret)).toBe("publish,share");
  });

  it("grants delete only with --allow-delete", () => {
    const output = mint("--name", "shell-delete", "--allow-delete");
    const secret = output.match(/hosti_[A-Za-z0-9_-]+/)?.[0] ?? "";
    expect(output).toContain("scopes delete,publish,share");
    expect(scopesOf(secret)).toBe("delete,publish,share");
  });
});
