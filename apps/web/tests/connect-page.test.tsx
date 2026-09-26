import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import type { PushScope } from "@hosti/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "./helpers";

const PASSWORD = "the-owner-password";
const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD = PASSWORD;
process.env.HOSTI_SECRET = SECRET;

const ORIGIN = "http://127.0.0.1:3000";
const MINUTE = 60 * 1000;

let signedCookie: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (signedCookie ? { value: signedCookie } : undefined),
  }),
  headers: async () => new Headers({ host: "hosti.test", "x-forwarded-proto": "https" }),
}));

const ConnectPage = (await import("@/app/connect/[id]/page")).default;
const LoginPage = (await import("@/app/login/page")).default;
const { POST: LOGIN } = await import("@/app/login/submit/route");
const { POST: APPROVE } = await import("@/app/connect/[id]/approve/route");
const { POST: DENY } = await import("@/app/connect/[id]/deny/route");
const nextConfig = (await import("../next.config")).default;
const support = await import("./support");

let dataDir: string;
let cookie: string;
let token: string;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function seed(name: string, scopes: PushScope[] = ["publish", "share"], now?: number) {
  const tokenSecret = `hosti_${randomBytes(24).toString("base64url")}`;
  const pollingSecret = randomBytes(24).toString("base64url");
  const created = support.createAgentConnection(
    {
      tokenName: name,
      tokenDigest: sha256(tokenSecret),
      pollingDigest: sha256(pollingSecret),
      scopes,
    },
    now,
  );
  return { ...created, tokenSecret, pollingSecret };
}

async function page(id: string, query: { error?: string } = {}): Promise<string> {
  return renderToStaticMarkup(
    await ConnectPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(query) }),
  );
}

async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2] ?? "";
    throw error;
  }
  throw new Error("expected a redirect");
}

function formPost(
  handler: typeof APPROVE,
  id: string,
  fields: [string, string][],
): Promise<Response> {
  return handler(
    new Request(`${ORIGIN}/connect/${id}/x`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `${support.SESSION_COOKIE}=${cookie}`,
      },
      body: new URLSearchParams(fields),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  cookie = support.signSession(SECRET);
  const session = support.verifySession(SECRET, cookie);
  if (!session) throw new Error("session should verify");
  token = support.mutationToken(SECRET, session);
  signedCookie = cookie;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("the approval page without a session", () => {
  it("sends the owner through /login and back to the same connection", async () => {
    const { id } = seed("needs-login");
    signedCookie = null;
    try {
      expect(await redirectOf(() => page(id))).toBe(
        `/login?next=${encodeURIComponent(`/connect/${id}`)}`,
      );
      expect(await redirectOf(() => page("not an id"))).toBe("/login");
    } finally {
      signedCookie = cookie;
    }
  });
});

describe("a pending connection", () => {
  it("shows the name, the code, the hint, the scopes and the expiry, with no password", async () => {
    const connection = seed("claude omarchy");
    const html = await page(connection.id);

    expect(html).toContain("claude omarchy");
    expect(html).toContain(connection.userCode);
    expect(html).toContain("matches the one the agent printed");
    expect(html).toContain('<input type="hidden" name="scope" value="publish"/>');
    expect(html).toContain('<input type="hidden" name="scope" value="share"/>');
    expect(html).not.toContain('value="delete"');
    expect(html).toContain(`dateTime="${connection.expiresAt}"`);
    expect(html).toContain(`action="/connect/${connection.id}/approve"`);
    expect(html).toContain(`action="/connect/${connection.id}/deny"`);
    expect(html.match(new RegExp(`name="token" value="${token}"`, "g"))?.length).toBe(2);
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain(connection.tokenSecret);
    expect(html).not.toContain(connection.pollingSecret);
  });

  it("offers delete as an unticked box, only when the agent asked for it", async () => {
    const html = await page(seed("wants-delete", ["publish", "share", "delete"]).id);
    const box = html.match(/<input type="checkbox"[^>]*>/g) ?? [];
    expect(box).toEqual(['<input type="checkbox" name="scope" value="delete"/>']);

    const narrow = await page(seed("publish-only", ["publish"]).id);
    expect(narrow).toContain('value="publish"');
    expect(narrow).not.toContain('value="share"');
    expect(narrow).not.toContain('type="checkbox"');
  });

  it("says so when the token could not be written", async () => {
    const html = await page(seed("clash").id, { error: "token_exists" });
    expect(html).toContain("already in use");
  });
});

describe("the result pages", () => {
  it("says the agent is connected, and with what", async () => {
    const connection = seed("connected", ["publish", "share", "delete"]);
    await formPost(APPROVE, connection.id, [
      ["token", token],
      ["scope", "publish"],
      ["scope", "share"],
    ]);
    const html = await page(connection.id);
    expect(html).toContain("Agent connected");
    expect(html).toContain("publish, share");
    expect(html).not.toContain("delete");
    expect(html).not.toContain(`/connect/${connection.id}/approve`);
  });

  it("says a denied connection got nothing", async () => {
    const connection = seed("turned-away");
    await formPost(DENY, connection.id, [["token", token]]);
    const html = await page(connection.id);
    expect(html).toContain("Connection denied");
    expect(html).not.toContain("/approve");
  });

  it("says an expired connection expired, and offers no approve", async () => {
    const connection = seed("too-slow", ["publish"], Date.now() - 11 * MINUTE);
    const html = await page(connection.id);
    expect(html).toContain("This connection expired");
    expect(html).not.toContain("/approve");
  });

  it("says an unknown id is no connection", async () => {
    for (const id of ["D".repeat(32), "not an id"]) {
      const html = await page(id);
      expect(html).toContain("No such connection");
      expect(html).not.toContain("/approve");
    }
  });
});

describe("framing", () => {
  it("answers every /connect path with frame-ancestors 'none'", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const connect = rules.find((rule) => rule.source === "/connect/:path*");
    expect(connect?.headers).toContainEqual({
      key: "Content-Security-Policy",
      value: "frame-ancestors 'none'",
    });
    expect(connect?.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
  });
});

describe("login and the way back", () => {
  function login(fields: Record<string, string>): Promise<Response> {
    return LOGIN(
      new Request(`${ORIGIN}/login/submit`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": `10.0.0.${Object.keys(fields).length}`,
        },
        body: new URLSearchParams(fields),
      }),
    );
  }

  async function loginPage(next?: string): Promise<string> {
    const query = next === undefined ? {} : { next };
    return renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve(query) }));
  }

  it("carries a /connect return path through the form", async () => {
    const { id } = seed("round-trip");
    signedCookie = null;
    try {
      const html = await loginPage(`/connect/${id}`);
      expect(html).toContain(`<input type="hidden" name="next" value="/connect/${id}"/>`);
      for (const next of ["//evil.example/connect/x", "https://evil.example", "/tokens", "/"]) {
        expect(await loginPage(next)).not.toContain('name="next"');
      }
    } finally {
      signedCookie = cookie;
    }
  });

  it("returns to the connection after the password, and only to a connection", async () => {
    const { id } = seed("returning");
    const back = await login({ password: PASSWORD, next: `/connect/${id}` });
    expect(back.status).toBe(303);
    expect(back.headers.get("location")).toBe(`/connect/${id}`);

    for (const next of [
      "https://evil.example/connect/abc",
      "//evil.example/connect/aaaaaaaaaaaaaaaaaaaa",
      "/connect/../tokens",
      "/tokens",
    ]) {
      const response = await login({ password: PASSWORD, next });
      expect(response.headers.get("location")).toBe("/");
    }
  });

  it("keeps the return path when the password is wrong", async () => {
    const { id } = seed("retrying");
    const response = await login({ password: "nope", next: `/connect/${id}` });
    expect(response.headers.get("location")).toBe(
      `/login?error=bad&next=${encodeURIComponent(`/connect/${id}`)}`,
    );
  });

  it("sends an owner who is already signed in straight on", async () => {
    const { id } = seed("already-in");
    expect(await redirectOf(() => loginPage(`/connect/${id}`))).toBe(`/connect/${id}`);
    expect(await redirectOf(() => loginPage("https://evil.example"))).toBe("/");
  });
});
