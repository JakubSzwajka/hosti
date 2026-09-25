import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_SECRET } from "./pin-helpers";
import { useTempDataDir } from "./helpers";

process.env.HOSTI_SECRET = TEST_SECRET;

const { navigate } = await import("./api");
const { protectedLink } = await import("./pin-helpers");
const { createPushToken } = await import("./support");

const TOKENS_THE_GATE_COPIES = [
  "--paper",
  "--card",
  "--ink",
  "--muted",
  "--line",
  "--line-soft",
  "--pop",
  "--danger",
] as const;

const HOSTI_CSS = path.resolve(import.meta.dirname, "../src/styles/hosti.css");

let dataDir: string;
let token: string;

function rootTokens(css: string): Map<string, string> {
  const block = css.match(/:root\s*\{([^}]*)\}/);
  if (!block?.[1]) throw new Error("no :root block");
  const tokens = new Map<string, string>();
  for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (name && value) tokens.set(name, value.trim().toLowerCase());
  }
  return tokens;
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  token = createPushToken("test").secret;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("the pin gate's palette", () => {
  it("uses the same token values as hosti.css", async () => {
    const link = await protectedLink(token, "gate-tokens", { pin: "4821" });
    const response = await navigate(`/v/${link}/`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("This link is protected");

    const gate = rootTokens(html);
    const catalog = rootTokens(await fs.readFile(HOSTI_CSS, "utf8"));
    for (const name of TOKENS_THE_GATE_COPIES) {
      expect(gate.get(name), `gate ${name}`).toBeDefined();
      expect(gate.get(name), `gate ${name} vs hosti.css`).toBe(catalog.get(name));
    }
  });
});
