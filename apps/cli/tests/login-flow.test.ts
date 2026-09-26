import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentAuthorizationStatusResponse } from "@hosti/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError, type ConnectionClient } from "../src/client.ts";
import { CommandError } from "../src/commands.ts";
import { defaultTokenName, login, type LoginContext, makeSecrets } from "../src/login.ts";

const BASE = "https://hosti.example.com";
const START = Date.parse("2026-09-26T10:00:00.000Z");
const EXPIRES = "2026-09-26T10:10:00.000Z";

type Poll = AgentAuthorizationStatusResponse | ApiError;

let configHome: string;

beforeEach(async () => {
  configHome = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-flow-"));
});

afterEach(async () => {
  await fs.rm(configHome, { recursive: true, force: true });
});

function harness(polls: Poll[], options: { pollAfterSeconds?: number; step?: number } = {}) {
  const sleeps: number[] = [];
  const out: string[] = [];
  const err: string[] = [];
  let now = START;
  const connection: ConnectionClient = {
    create: async () => ({
      id: "abc",
      userCode: "KX4F-9QLM",
      approvalUrl: `${BASE}/connect/abc`,
      expiresAt: EXPIRES,
      pollAfterSeconds: options.pollAfterSeconds ?? 2,
    }),
    poll: async () => {
      const next = polls.length > 1 ? polls.shift() : polls[0];
      if (!next) throw new Error("no poll answer left");
      if (next instanceof ApiError) throw next;
      return next;
    },
  };
  const context: LoginContext = {
    target: BASE,
    flags: { name: "flow" },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: { XDG_CONFIG_HOME: configHome },
    openUrl: () => {},
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms * (options.step ?? 1);
    },
    now: () => now,
    connect: () => connection,
  };
  return { context, sleeps, out, err };
}

const pending = (pollAfterSeconds: number): Poll => ({
  status: "pending",
  expiresAt: EXPIRES,
  pollAfterSeconds,
});
const approved: Poll = { status: "approved", scopes: ["publish", "share"], name: "flow" };

describe("polling", () => {
  it("waits the delay the server asks for, before each poll", async () => {
    const { context, sleeps } = harness([pending(5), pending(3), approved], {
      pollAfterSeconds: 4,
    });
    await login(context);
    expect(sleeps).toEqual([4000, 5000, 3000]);
  });

  it("never polls faster than once a second or slower than every thirty", async () => {
    const { context, sleeps } = harness([pending(0), pending(600), approved], {
      pollAfterSeconds: 0.1,
    });
    await login(context);
    expect(sleeps).toEqual([1000, 1000, 30000]);
  });

  it("gives up once the connection expires, and saves nothing", async () => {
    // Each 2 s sleep moves the clock a minute, so ten polls pass the 10 minute expiry.
    const { context, sleeps } = harness([pending(2)], { step: 30 });
    const failure = await login(context).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CommandError);
    expect((failure as Error).message).toMatch(/expired.*hosti login again/);
    expect(sleeps).toHaveLength(10);
    await expect(fs.stat(path.join(configHome, "hosti.json"))).rejects.toThrow();
  });

  it("keeps polling through a network blip and warns once", async () => {
    const blip = new ApiError("Cannot reach https://hosti.example.com: ECONNRESET");
    const { context, err } = harness([blip, blip, approved]);
    await login(context);
    expect(err.filter((line) => line.includes("ECONNRESET"))).toHaveLength(1);
    const saved = JSON.parse(await fs.readFile(path.join(configHome, "hosti.json"), "utf8"));
    expect(saved.url).toBe(BASE);
  });

  it("stops on a refusal that is not a blip", async () => {
    const refusal = new ApiError("Bad polling request", 400, "bad_request");
    const { context } = harness([refusal]);
    await expect(login(context)).rejects.toThrow("Bad polling request");
  });
});

describe("what login makes", () => {
  it("makes a hosti_ token and a different polling secret", () => {
    const first = makeSecrets();
    const second = makeSecrets();
    expect(first.token).toMatch(/^hosti_[A-Za-z0-9_-]{32}$/);
    expect(first.pollingSecret).not.toBe(first.token);
    expect(first.token).not.toBe(second.token);
  });

  it("bends <user>@<host> to the push token name rule", () => {
    expect(defaultTokenName("kuba", "omarchy")).toBe("kuba-omarchy");
    expect(defaultTokenName("kuba", "box.local")).toBe("kuba-box-local");
    expect(defaultTokenName("@@", "..")).toBe("hosti-cli");
    const long = defaultTokenName("a".repeat(50), "b".repeat(50));
    expect(long).toHaveLength(64);
    expect(long).toMatch(/^[A-Za-z0-9_\- ]+$/);
  });
});
