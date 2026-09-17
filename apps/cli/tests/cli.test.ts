import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const BIN = path.resolve(import.meta.dirname, "../src/index.ts");
let configHome: string;

type Run = { code: number; stdout: string; stderr: string };

/** Run the CLI the way a shell does, and report the exit code an agent reads. */
async function hosti(args: string[], env: NodeJS.ProcessEnv = {}): Promise<Run> {
  try {
    const { stdout, stderr } = await run(process.execPath, [BIN, ...args], {
      env: { PATH: process.env.PATH ?? "", XDG_CONFIG_HOME: configHome, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

beforeAll(async () => {
  configHome = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-cli-"));
});

afterAll(async () => {
  await fs.rm(configHome, { recursive: true, force: true });
});

describe("the exit code an agent reads", () => {
  it("prints the usage and stops at zero with no command", async () => {
    const result = await hosti([]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("hosti push <path>");
  });

  it("fails with no token, naming what to set", async () => {
    const result = await hosti(["ls"], { HOSTI_URL: "http://127.0.0.1:3000" });
    expect(result.code).not.toBe(0);
    expect(result.stderr.trim().split("\n").at(-1)).toContain("HOSTI_TOKEN");
    expect(result.stdout).toBe("");
  });

  it("fails with no server", async () => {
    const result = await hosti(["ls"], { HOSTI_TOKEN: "hosti_x" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("HOSTI_URL");
  });

  it("fails on a command it does not know", async () => {
    const result = await hosti(["deploy", "./dist"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unknown command");
  });

  it("fails when the server is not listening, printing its own last line", async () => {
    const result = await hosti(["ls"], {
      HOSTI_URL: "http://127.0.0.1:9",
      HOSTI_TOKEN: "hosti_x",
    });
    expect(result.code).toBe(1);
    expect(result.stderr.trim().split("\n").at(-1)).toContain("Cannot reach http://127.0.0.1:9");
  });

  it("fails when the path to push is not there", async () => {
    const result = await hosti(["push", "/tmp/hosti-nope", "--slug", "nope"], {
      HOSTI_URL: "http://127.0.0.1:9",
      HOSTI_TOKEN: "hosti_x",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("There is nothing at /tmp/hosti-nope");
  });
});
