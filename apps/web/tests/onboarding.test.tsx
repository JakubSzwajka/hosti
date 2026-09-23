import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "./helpers";

const PASSWORD = "the-owner-password";
const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD = PASSWORD;
process.env.HOSTI_SECRET = SECRET;
process.env.HOSTI_PUBLIC_URL = "";

const ORIGIN = "http://127.0.0.1:3000";
const HOST = "hosti.test";

let signedCookie: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (signedCookie ? { value: signedCookie } : undefined),
  }),
  headers: async () => new Headers({ host: HOST, "x-forwarded-proto": "https" }),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {} }),
}));

const { POST: MINT } = await import("@/app/tokens/mint/route");
const PushTokens = (await import("@/app/tokens/page")).default;
const Catalog = (await import("@/app/page")).default;
const { SKILL_INSTALL_COMMAND, TOKEN_MARKER } = await import("@/app/_ui/onboarding-panel");
const { SESSION_COOKIE, mutationToken, signSession, verifySession } = await import(
  "@/server/auth/session"
);
const { createPushToken, listPushTokens } = await import("@/server/push-tokens");

let dataDir: string;
let cookie: string;
let token: string;

const SKILL_PATH = fileURLToPath(
  new URL("../../../skills/hosti-publish/SKILL.md", import.meta.url),
);

async function skillText(): Promise<string> {
  return fs.readFile(SKILL_PATH, "utf8");
}

async function render(component: () => Promise<React.ReactElement>): Promise<string> {
  return renderToStaticMarkup(await component());
}

function tokensPage(query: { shown?: string; token?: string } = {}) {
  return () => PushTokens({ searchParams: Promise.resolve(query) });
}

async function mint(name: string): Promise<string> {
  const request = new Request(`${ORIGIN}/tokens/mint`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: `${SESSION_COOKIE}=${cookie}`,
    },
    body: new URLSearchParams({ token, name }),
  });
  const response = await MINT(request);
  const id = new URL(response.headers.get("location") ?? "", ORIGIN).searchParams.get("shown");
  if (!id) throw new Error(`mint held no secret: ${response.headers.get("location")}`);
  return id;
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  cookie = signSession(SECRET);
  const session = verifySession(SECRET, cookie);
  if (!session) throw new Error("session should verify");
  token = mutationToken(SECRET, session);
  signedCookie = cookie;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("the hosti-publish skill file", () => {
  it("has installable front matter and reads its instance from the environment", async () => {
    const body = await skillText();
    expect(body).toMatch(/^---\n/);
    expect(body).toContain("name: hosti-publish");
    const description = body.match(/^description: (\S.*)$/m)?.[1] ?? "";
    for (const trigger of ["publish", "host", "share", "report", "dashboard", "static"]) {
      expect(description.toLowerCase()).toContain(trigger);
    }
    expect(body).not.toContain("http");
    expect(body).toContain("$HOSTI_URL");
    expect(body).toContain("HOSTI_TOKEN   a push token");
  });

  it("carries no push token, whatever tokens this instance holds", async () => {
    const minted = createPushToken("skill-reader");
    const body = await skillText();
    expect(body).not.toContain(minted.secret);
    expect(body).not.toMatch(/hosti_[A-Za-z0-9_-]{8,}/);
    expect(body).toContain("$HOSTI_TOKEN");
  });

  it("teaches curl, never the private CLI package", async () => {
    const body = await skillText();
    expect(body).toContain("curl -X POST");
    expect(body).not.toContain("hosti push");
    expect(body).not.toContain("@hosti/cli");
  });

  it("names the three things the agent may not do", async () => {
    const body = await skillText();
    expect(body).toContain("Do not rotate a share slug");
    expect(body).toContain("Do not delete a bundle");
    expect(body).toContain("Do not set a pin");
  });
});

describe("the /tokens page", () => {
  it("sends a caller with no admin session to the login form", async () => {
    signedCookie = null;
    try {
      await expect(render(tokensPage())).rejects.toThrow(/NEXT_REDIRECT/);
    } finally {
      signedCookie = cookie;
    }
  });

  it("lists every push token, with a revoke on each", async () => {
    createPushToken("laptop");
    createPushToken("ci runner");
    const html = await render(tokensPage());

    for (const record of listPushTokens()) {
      expect(html).toContain(record.name);
    }
    expect(html).toContain('action="/tokens/revoke"');
    const revokes = html.match(/name="id"/g) ?? [];
    expect(revokes.length).toBe(listPushTokens().length);
  });

  it("shows no secret and no digest when nothing was just minted", async () => {
    const html = await render(tokensPage());
    expect(html).not.toContain("hosti_");
    expect(html).toContain(TOKEN_MARKER);
  });
});

describe("the minted secret", () => {
  it("shows once, and the second read of the same id shows nothing", async () => {
    const id = await mint("shown-once");

    const first = await render(tokensPage({ shown: id }));
    const secret = first.match(/hosti_[A-Za-z0-9_-]+/)?.[0];
    expect(secret).toMatch(/^hosti_/);
    expect(first).toContain("shown once");

    const second = await render(tokensPage({ shown: id }));
    expect(second).not.toContain("hosti_");
    expect(second).toContain(TOKEN_MARKER);
  });

  it("is already in the prompt the owner copies", async () => {
    const id = await mint("in-the-prompt");
    const html = await render(tokensPage({ shown: id }));
    const secret = html.match(/hosti_[A-Za-z0-9_-]+/)?.[0] ?? "";
    expect(html).toContain(`HOSTI_TOKEN=${secret}`);
    expect(html).toContain(SKILL_INSTALL_COMMAND);
    expect(html).not.toContain(TOKEN_MARKER);
  });

  it("says so when a name was refused, and mints nothing", async () => {
    const before = listPushTokens().length;
    const html = await render(tokensPage({ token: "bad_token_name" }));
    expect(html).toContain("push token name");
    expect(listPushTokens().length).toBe(before);
  });
});

describe("the empty catalog", () => {
  it("offers the panel instead of telling the owner to open a shell", async () => {
    const html = await render(Catalog);
    expect(html).toContain('action="/tokens/mint"');
    expect(html).toContain(TOKEN_MARKER);
    expect(html).not.toContain("npm run token:new");
    expect(html).not.toContain("hosti push ./out");
    expect(SKILL_INSTALL_COMMAND).toBe("npx skills add JakubSzwajka/hosti");
    expect(SKILL_INSTALL_COMMAND).not.toContain("http");
    expect(html).toContain(SKILL_INSTALL_COMMAND);
    // The prompt still carries the instance URL. Nothing else may.
    expect(html.match(new RegExp(`https://${HOST}`, "g"))?.length).toBe(1);
  });

  it("reaches /tokens from the masthead", async () => {
    const html = await render(Catalog);
    expect(html).toContain('href="/tokens"');
  });
});
