import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Flags } from "./args.ts";

export class ConfigError extends Error {}

export type Config = { url: string; token: string };

type FileConfig = { url?: string; token?: string };

/** `~/.config/hosti.json`, or XDG_CONFIG_HOME when the shell sets one. */
export function configFilePath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config");
  return path.join(base, "hosti.json");
}

function readConfigFile(file: string): FileConfig {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as FileConfig;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (error) {
    throw new ConfigError(`${file} is not valid JSON: ${(error as Error).message}`);
  }
}

function pick(...candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * Flags win, then the environment, then the config file. Anything missing is
 * one sentence naming the three places it could come from.
 */
export function resolveConfig(flags: Flags, env: NodeJS.ProcessEnv = process.env): Config {
  const file = configFilePath(env);
  const fromFile = readConfigFile(file);

  const url = pick(flags.url, env.HOSTI_URL, fromFile.url);
  const token = pick(flags.token, env.HOSTI_TOKEN, fromFile.token);

  if (!url) {
    throw new ConfigError(`No Hosti server: pass --url, set HOSTI_URL, or put "url" in ${file}`);
  }
  if (!token) {
    throw new ConfigError(
      `No push token: pass --token, set HOSTI_TOKEN, or put "token" in ${file}`,
    );
  }
  return { url: url.replace(/\/+$/, ""), token };
}
