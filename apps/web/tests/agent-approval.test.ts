import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "./helpers";

const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD = "the-owner-password";
process.env.HOSTI_SECRET = SECRET;
process.env.HOSTI_PUBLIC_URL = "https://hosti.example/";

const ORIGIN = "http://127.0.0.1:3000";
const MINUTE = 60 * 1000;

const { GET: WHOAMI } = await import("@/app/api/v1/whoami/route");
const support = await import("./support");
const { createPushToken, listPushTokens, mutationToken, signSession } = support;
const { agent, approve, connect, deny, form, pollBody, record, secrets, seen, useOwner } =
  await import("./agents");

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

describe("approving", () => {
  it("needs the admin session and the mutation token, never a push token", async () => {
    const one = agent("gated");
    const { id } = await connect(one);
    const bearer = createPushToken("bearer-holder").secret;
    secrets.push(bearer);

    const anonymous = await form(
      "approve",
      id,
      [
        ["token", token],
        ["scope", "publish"],
      ],
      {
        cookie: false,
      },
    );
    const withBearer = await form(
      "approve",
      id,
      [
        ["token", token],
        ["scope", "publish"],
      ],
      {
        cookie: false,
        bearer,
      },
    );
    const noToken = await form("approve", id, [["scope", "publish"]]);
    const wrongToken = await form("approve", id, [
      ["token", "guessed"],
      ["scope", "publish"],
    ]);
    const denyAnonymous = await form("deny", id, [["token", token]], { cookie: false });

    expect(anonymous.status).toBe(401);
    expect(withBearer.status).toBe(401);
    expect(noToken.status).toBe(403);
    expect(wrongToken.status).toBe(403);
    expect(denyAnonymous.status).toBe(401);
    expect(await pollBody(id, one.pollingSecret)).toMatchObject({ status: "pending" });
    expect(listPushTokens().some((record) => record.name === "gated")).toBe(false);
  });

  it("activates the agent's own token with no password, and the agent reads approved", async () => {
    const one = agent("approved-agent");
    const { id } = await connect(one);
    const response = await approve(id);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/connect/${id}`);
    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(await pollBody(id, one.pollingSecret)).toEqual({
      status: "approved",
      scopes: ["publish", "share"],
      name: "approved-agent",
    });
    // Polling again is safe and says the same.
    expect(await pollBody(id, one.pollingSecret)).toMatchObject({ status: "approved" });

    const whoami = await WHOAMI(
      new Request(`${ORIGIN}/api/v1/whoami`, {
        headers: { authorization: `Bearer ${one.tokenSecret}` },
      }),
    ).then(record);
    expect(await whoami.json()).toEqual({ name: "approved-agent", scopes: ["publish", "share"] });
  });

  it("leaves delete off unless the owner ticks it, and never grants more than asked", async () => {
    const unticked = agent("asks-delete", ["publish", "share", "delete"]);
    const ticked = agent("gets-delete", ["publish", "share", "delete"]);
    const narrow = agent("asks-publish", ["publish"]);
    const ids = [await connect(unticked), await connect(ticked), await connect(narrow)];

    await approve(ids[0]?.id ?? "", ["publish", "share"]);
    await approve(ids[1]?.id ?? "", ["publish", "share", "delete"]);
    await approve(ids[2]?.id ?? "", ["publish", "share", "delete"]);

    const scopes = (name: string) => listPushTokens().find((one) => one.name === name)?.scopes;
    expect(scopes("asks-delete")).toEqual(["publish", "share"]);
    expect(scopes("gets-delete")).toEqual(["publish", "share", "delete"]);
    expect(scopes("asks-publish")).toEqual(["publish"]);
  });

  it("changes nothing on a settled connection, and cannot approve an expired one", async () => {
    const yes = agent("settled-yes");
    const no = agent("settled-no");
    const late = agent("settled-late");
    const approved = await connect(yes);
    const denied = await connect(no);
    const expired = support.createAgentConnection(late.body, Date.now() - 11 * MINUTE);
    await approve(approved.id, ["publish"]);
    await deny(denied.id);
    const before = listPushTokens().length;

    const reapprove = await approve(approved.id, ["publish", "share"]);
    await deny(approved.id);
    await approve(denied.id);
    const lateApproval = await approve(expired.id);

    expect(reapprove.headers.get("location")).toBe(`/connect/${approved.id}`);
    expect(lateApproval.headers.get("location")).toBe(`/connect/${expired.id}`);
    expect(await pollBody(approved.id, yes.pollingSecret)).toEqual({
      status: "approved",
      scopes: ["publish"],
      name: "settled-yes",
    });
    expect(await pollBody(denied.id, no.pollingSecret)).toEqual({ status: "denied" });
    expect(await pollBody(expired.id, late.pollingSecret)).toEqual({ status: "expired" });
    expect(listPushTokens().length).toBe(before);
  });

  it("answers an unknown or malformed id without writing anything", async () => {
    const before = listPushTokens().length;
    const unknown = await approve("C".repeat(32));
    const malformed = await approve("not an id");
    expect(unknown.status).toBe(303);
    expect(unknown.headers.get("location")).toBe(`/connect/${"C".repeat(32)}`);
    expect(malformed.status).toBe(404);
    expect(listPushTokens().length).toBe(before);
  });
});

describe("denying", () => {
  it("leaves no token behind, and the agent reads denied", async () => {
    const one = agent("denied-agent");
    const { id } = await connect(one);
    const response = await deny(id);

    expect(response.status).toBe(303);
    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(await pollBody(id, one.pollingSecret)).toEqual({ status: "denied" });
    expect(await pollBody(id, one.pollingSecret)).toEqual({ status: "denied" });
    expect(listPushTokens().some((record) => record.name === "denied-agent")).toBe(false);
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
