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

const PushTokens = (await import("@/app/tokens/page")).default;
const Catalog = (await import("@/app/page")).default;
const { CLI_INSTALL_COMMAND, SKILL_INSTALL_COMMAND, agentPrompt } = await import(
  "@/app/_ui/onboarding-panel"
);
const { signSession, verifySession, createPushToken, listPushTokens } = await import("./support");

let dataDir: string;
let cookie: string;

const SKILL_PATH = fileURLToPath(
  new URL("../../../skills/hosti-publish/SKILL.md", import.meta.url),
);

async function skillText(): Promise<string> {
  return fs.readFile(SKILL_PATH, "utf8");
}

async function render(component: () => Promise<React.ReactElement>): Promise<string> {
  return renderToStaticMarkup(await component());
}

function tokensPage(query: { token?: string } = {}) {
  return () => PushTokens({ searchParams: Promise.resolve(query) });
}

function decodeEntities(html: string): string {
  return html
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  cookie = signSession(SECRET);
  const session = verifySession(SECRET, cookie);
  if (!session) throw new Error("session should verify");
  signedCookie = cookie;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("the hosti-publish skill file", () => {
  it("has installable front matter and names no instance", async () => {
    const body = await skillText();
    expect(body).toMatch(/^---\n/);
    expect(body).toContain("name: hosti-publish");
    const description = body.match(/^description: (\S.*)$/m)?.[1] ?? "";
    for (const trigger of ["publish", "host", "share", "report", "dashboard", "static"]) {
      expect(description.toLowerCase()).toContain(trigger);
    }
    // The install command is the one URL the skill may carry.
    expect(body.replaceAll(CLI_INSTALL_COMMAND, "")).not.toContain("http");
  });

  it("carries no push token, whatever tokens this instance holds", async () => {
    const minted = createPushToken("skill-reader");
    const body = await skillText();
    expect(body).not.toContain(minted.secret);
    expect(body).not.toMatch(/hosti_[A-Za-z0-9_-]{8,}/);
    expect(body).toContain("Never print the token");
  });

  it("installs the CLI, checks whoami and logs in through the browser", async () => {
    const body = await skillText();
    expect(body).toContain(CLI_INSTALL_COMMAND);
    expect(body).toContain("Node 24.21.0");
    expect(body).toContain("hosti whoami");
    expect(body).toContain("hosti login <catalog URL>");
    expect(body).toContain("check that the page shows the same code");
    expect(body).not.toContain("curl");
  });

  it("covers push, share, rotate and open through the CLI", async () => {
    const body = await skillText();
    expect(body).toContain("hosti push ./out --slug");
    expect(body).toContain("--mode link");
    expect(body).toContain("--mode pin --pin");
    expect(body).toContain("--mode private");
    expect(body).toContain("hosti rotate");
    expect(body).toContain("hosti open");
  });

  it("deletes only with the delete scope and the owner's word, and never invents a pin", async () => {
    const body = await skillText();
    expect(body).toContain("lists the delete scope");
    expect(body).toContain("the owner asked you to delete that bundle");
    expect(body).toContain("Never invent a pin");
    expect(body).toContain("Rotate only when the owner asks");
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

  it("lists every push token with its scopes and last use, and a revoke on each", async () => {
    createPushToken("laptop", ["publish", "share"]);
    createPushToken("ci runner", ["publish"]);
    const html = await render(tokensPage());

    for (const record of listPushTokens()) {
      expect(html).toContain(record.name);
    }
    expect(html).toContain("publish, share, delete");
    expect(html).toContain("publish, share<");
    expect(html).toContain("unused");
    expect(html).toContain('action="/tokens/revoke"');
    const revokes = html.match(/name="id"/g) ?? [];
    expect(revokes.length).toBe(listPushTokens().length);
  });

  it("renders no mint form and no secret", async () => {
    const html = await render(tokensPage());
    expect(html).not.toContain("/tokens/mint");
    expect(html).not.toContain('name="name"');
    expect(html).not.toContain("hosti_");
    expect(html).not.toContain("HOSTI_TOKEN");
  });

  it("leads with the install command and the login command for this instance", async () => {
    const html = decodeEntities(await render(tokensPage()));
    const install = html.indexOf(CLI_INSTALL_COMMAND);
    const login = html.indexOf(`hosti login https://${HOST}`);
    expect(install).toBeGreaterThan(-1);
    expect(login).toBeGreaterThan(install);
    expect(html).toContain(SKILL_INSTALL_COMMAND);
  });
});

describe("the agent prompt", () => {
  it("tells the agent to install the CLI and log in, and carries no token", async () => {
    const prompt = agentPrompt(`https://${HOST}/`);
    expect(prompt).toContain(CLI_INSTALL_COMMAND);
    expect(prompt).toContain(`hosti login https://${HOST}\n`);
    expect(prompt).toContain(SKILL_INSTALL_COMMAND);
    expect(prompt).not.toMatch(/hosti_[A-Za-z0-9_-]{8,}/);
    expect(prompt).not.toContain("HOSTI_TOKEN");

    const html = decodeEntities(await render(tokensPage()));
    expect(html).toContain(prompt.trim());
  });

  it("installs from the release tarball on GitHub", () => {
    expect(CLI_INSTALL_COMMAND).toBe(
      "npm install -g https://github.com/JakubSzwajka/hosti/releases/latest/download/hosti-cli.tgz",
    );
  });
});

describe("the empty catalog", () => {
  it("offers the panel instead of telling the owner to open a shell", async () => {
    const html = decodeEntities(await render(Catalog));
    expect(html).toContain(CLI_INSTALL_COMMAND);
    expect(html).toContain(`hosti login https://${HOST}`);
    expect(html).not.toContain("/tokens/mint");
    expect(html).not.toContain("npm run token:new");
    expect(html).not.toContain("hosti push ./out");
    expect(SKILL_INSTALL_COMMAND).toBe("npx skills add JakubSzwajka/hosti");
    expect(SKILL_INSTALL_COMMAND).not.toContain("http");
    expect(html).toContain(SKILL_INSTALL_COMMAND);
    // The login command and the prompt carry the instance URL. Nothing else may.
    expect(html.match(new RegExp(`https://${HOST}`, "g"))?.length).toBe(2);
  });

  it("reaches /tokens from the masthead", async () => {
    const html = await render(Catalog);
    expect(html).toContain('href="/tokens"');
  });
});
