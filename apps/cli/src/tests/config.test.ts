import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigError, configFilePath, resolveConfig } from "../delivery/config.ts";

let configHome: string;

async function writeConfigFile(body: string): Promise<void> {
  await fs.writeFile(path.join(configHome, "hosti.json"), body, "utf8");
}

beforeAll(async () => {
  configHome = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-config-"));
  await writeConfigFile(JSON.stringify({ url: "https://file.example.com", token: "hosti_file" }));
});

afterAll(async () => {
  await fs.rm(configHome, { recursive: true, force: true });
});

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { XDG_CONFIG_HOME: configHome, ...extra };
}

describe("where the settings come from", () => {
  it("falls back to the config file", () => {
    expect(resolveConfig({}, env())).toEqual({
      url: "https://file.example.com",
      token: "hosti_file",
    });
  });

  it("lets the environment beat the file", () => {
    expect(
      resolveConfig({}, env({ HOSTI_URL: "https://env.example.com", HOSTI_TOKEN: "hosti_env" })),
    ).toEqual({ url: "https://env.example.com", token: "hosti_env" });
  });

  it("lets a flag beat both", () => {
    const config = resolveConfig(
      { url: "https://flag.example.com", token: "hosti_flag" },
      env({ HOSTI_URL: "https://env.example.com", HOSTI_TOKEN: "hosti_env" }),
    );
    expect(config).toEqual({ url: "https://flag.example.com", token: "hosti_flag" });
  });

  it("mixes the sources per setting", () => {
    expect(resolveConfig({}, env({ HOSTI_TOKEN: "hosti_env" }))).toEqual({
      url: "https://file.example.com",
      token: "hosti_env",
    });
  });

  it("drops a trailing slash from the URL", () => {
    expect(resolveConfig({ url: "http://127.0.0.1:3000/" }, env()).url).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("names what to set when the token is missing", async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-empty-"));
    try {
      const only = { XDG_CONFIG_HOME: empty, HOSTI_URL: "http://127.0.0.1:3000" };
      expect(() => resolveConfig({}, only)).toThrow(ConfigError);
      expect(() => resolveConfig({}, only)).toThrow(/HOSTI_TOKEN/);
      expect(() => resolveConfig({}, { XDG_CONFIG_HOME: empty })).toThrow(/HOSTI_URL/);
    } finally {
      await fs.rm(empty, { recursive: true, force: true });
    }
  });

  it("says which file it could not parse", async () => {
    const broken = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-broken-"));
    await fs.writeFile(path.join(broken, "hosti.json"), "{ not json", "utf8");
    try {
      expect(() => resolveConfig({}, { XDG_CONFIG_HOME: broken })).toThrow(/hosti.json is not/);
    } finally {
      await fs.rm(broken, { recursive: true, force: true });
    }
  });

  it("never echoes the file's contents when it fails to parse", async () => {
    const broken = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-broken-token-"));
    const secret = "hosti_super-secret-token-do-not-print-me";
    const file = path.join(broken, "hosti.json");
    // Node's JSON.parse message would quote input right around the syntax error.
    await fs.writeFile(file, `{ "token": "${secret}", broken`, "utf8");
    try {
      let caught: unknown;
      try {
        resolveConfig({}, { XDG_CONFIG_HOME: broken });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ConfigError);
      expect((caught as Error).message).toBe(`${file} is not valid JSON`);
      expect((caught as Error).message).not.toContain(secret);
    } finally {
      await fs.rm(broken, { recursive: true, force: true });
    }
  });

  it("looks in ~/.config when no XDG home is set", () => {
    expect(configFilePath({})).toBe(path.join(os.homedir(), ".config/hosti.json"));
  });
});
