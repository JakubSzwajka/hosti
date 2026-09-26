import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Flags } from "./args.ts";

export class ConfigError extends Error {}

export type Config = { url: string; token: string };

type FileConfig = { url?: string; token?: string; [key: string]: unknown };

export function configFilePath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config");
  return path.join(base, "hosti.json");
}

export function readConfigFile(file: string): FileConfig {
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

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function pick(...candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return undefined;
}

export function resolveConfig(flags: Flags, env: NodeJS.ProcessEnv = process.env): Config {
  const file = configFilePath(env);
  const fromFile = readConfigFile(file);

  const url = pick(flags.url, env.HOSTI_URL, text(fromFile.url));
  const token = pick(flags.token, env.HOSTI_TOKEN, text(fromFile.token));

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

export function envOverrides(env: NodeJS.ProcessEnv = process.env): string[] {
  return ["HOSTI_URL", "HOSTI_TOKEN"].filter((name) => env[name]?.trim());
}

export type SavedLogin = { file: string; previousUrl: string | null; replacedBroken: boolean };

function writePrivate(file: string, body: FileConfig): void {
  // A private temp file renamed into place means the token is never readable by others.
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, file);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
  fs.chmodSync(file, 0o600);
}

export function saveLogin(login: Config, env: NodeJS.ProcessEnv = process.env): SavedLogin {
  const file = configFilePath(env);
  let existing: FileConfig = {};
  let replacedBroken = false;
  try {
    existing = readConfigFile(file);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    replacedBroken = true;
  }
  const previous = text(existing.url)?.trim().replace(/\/+$/, "") || null;
  writePrivate(file, { ...existing, url: login.url, token: login.token });
  return { file, previousUrl: previous, replacedBroken };
}

export type RemovedLogin = { file: string; url: string | null; removed: boolean };

export function removeLogin(env: NodeJS.ProcessEnv = process.env): RemovedLogin {
  const file = configFilePath(env);
  const existing = readConfigFile(file);
  const url = text(existing.url)?.trim().replace(/\/+$/, "") || null;
  if (existing.url === undefined && existing.token === undefined) {
    return { file, url, removed: false };
  }
  const rest = Object.fromEntries(
    Object.entries(existing).filter(([key]) => key !== "url" && key !== "token"),
  );
  if (Object.keys(rest).length === 0) fs.rmSync(file, { force: true });
  else writePrivate(file, rest);
  return { file, url, removed: true };
}
