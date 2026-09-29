import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "./test-fixtures";

const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD = "the-owner-password";
process.env.HOSTI_SECRET = SECRET;
process.env.HOSTI_PUBLIC_URL = "https://hosti.example/";

const MINUTE = 60 * 1000;

const support = await import("./support");
const { createPushToken, listPushTokens, mutationToken, signSession } = support;
const { agent, connect, create, poll, pollBody, secrets, seen, sha256, useOwner } = await import(
  "./agents"
);

let dataDir: string;
let token: string;
const logged: string[] = [];

beforeAll(async () => {
  dataDir = await useTempDataDir();
  const cookie = signSession(SECRET);
  const session = support.verifySession(SECRET, cookie);
  if (!session) throw new Error("session should verify");
  token = mutationToken(SECRET, session);
  useOwner(cookie, token);
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  }
});

afterAll(async () => {
  vi.restoreAllMocks();
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("POST /api/v1/agent-authorizations", () => {
  it("takes digests alone and answers with an id, a user code and the approval URL", async () => {
    const one = agent("claude omarchy");
    const before = Date.now();
    const response = await create(one.body);
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      "approvalUrl",
      "expiresAt",
      "id",
      "pollAfterSeconds",
      "userCode",
    ]);
    expect(body.id).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(body.userCode).toMatch(/^[BCDFGHJKMNPQRSTVWXZ2-9]{4}-[BCDFGHJKMNPQRSTVWXZ2-9]{4}$/);
    expect(body.approvalUrl).toBe(`https://hosti.example/connect/${body.id}`);
    expect(body.pollAfterSeconds).toBe(2);
    const expires = Date.parse(String(body.expiresAt));
    expect(expires).toBeGreaterThanOrEqual(before + 10 * MINUTE);
    expect(expires).toBeLessThanOrEqual(Date.now() + 10 * MINUTE);
    // Nothing reaches the database before the owner says yes.
    expect(listPushTokens().some((one) => one.name === "claude omarchy")).toBe(false);
  });

  it("refuses a body that is not a JSON object", async () => {
    for (const body of ["", "not json", "[]", "null", "42"]) {
      const response = await create(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "bad_request" });
    }
  });

  it("refuses a bad name, bad digests and bad scopes", async () => {
    const one = agent("fine");
    const cases: [Record<string, unknown>, string][] = [
      [{ ...one.body, tokenName: "laptop/ci" }, "bad_token_name"],
      [{ ...one.body, tokenName: "" }, "bad_token_name"],
      [{ ...one.body, tokenDigest: "abc" }, "bad_digest"],
      [{ ...one.body, tokenDigest: one.body.tokenDigest.toUpperCase() }, "bad_digest"],
      [{ ...one.body, pollingDigest: undefined }, "bad_digest"],
      [{ ...one.body, pollingDigest: one.body.tokenDigest }, "bad_digest"],
      [{ ...one.body, scopes: ["share"] }, "bad_scopes"],
      [{ ...one.body, scopes: ["publish", "admin"] }, "bad_scopes"],
      [{ ...one.body, scopes: "publish" }, "bad_scopes"],
    ];
    for (const [body, code] of cases) {
      const response = await create(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: code });
    }
  });

  it("refuses a token digest a push token or a pending connection already has", async () => {
    const existing = createPushToken("already-here");
    secrets.push(existing.secret);
    const taken = await create({ ...agent("copy").body, tokenDigest: sha256(existing.secret) });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ error: "token_exists" });

    const first = agent("first");
    await connect(first);
    const twice = await create({ ...agent("second").body, tokenDigest: first.body.tokenDigest });
    expect(twice.status).toBe(409);
    expect(await twice.json()).toMatchObject({ error: "token_exists" });
  });
});

describe("GET /api/v1/agent-authorizations/<id>", () => {
  it("answers pending to the polling secret", async () => {
    const one = agent("pending-agent");
    const { id } = await connect(one);
    const response = await poll(id, one.pollingSecret);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "pending",
      expiresAt: expect.any(String),
      pollAfterSeconds: 2,
    });
  });

  it("answers the same 404 to an unknown id, a wrong secret and no secret", async () => {
    const one = agent("guarded");
    const { id } = await connect(one);
    const answers = [
      await poll("A".repeat(32), one.pollingSecret),
      await poll("../../tokens", one.pollingSecret),
      await poll(id, agent("other").pollingSecret),
      await poll(id, one.body.pollingDigest),
      await poll(id),
      await poll(id, ""),
    ];
    const bodies = await Promise.all(answers.map((answer) => answer.text()));
    for (const [index, answer] of answers.entries()) {
      expect(answer.status).toBe(404);
      expect(bodies[index]).toBe(bodies[0]);
    }
  });

  it("answers expired after ten minutes, and 404 once the server has dropped it", async () => {
    const late = agent("late-agent");
    const expired = support.createAgentConnection(late.body, Date.now() - 11 * MINUTE);
    expect(await pollBody(expired.id, late.pollingSecret)).toEqual({ status: "expired" });

    const gone = agent("gone-agent");
    const dropped = support.createAgentConnection(gone.body, Date.now() - 21 * MINUTE);
    const answer = await poll(dropped.id, gone.pollingSecret);
    expect(answer.status).toBe(404);
    expect(await answer.text()).toBe(await (await poll("B".repeat(32), "x")).text());
  });
});

describe("what the connection flow may say out loud", () => {
  it("never puts a clear push token or polling secret in a response or a log line", () => {
    expect(seen.length).toBeGreaterThan(10);
    expect(secrets.length).toBeGreaterThan(10);
    const everything = [...seen, ...logged].join("\n");
    for (const secret of secrets) expect(everything).not.toContain(secret);
  });
});
