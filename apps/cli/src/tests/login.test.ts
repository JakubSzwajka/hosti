import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONNECTION_ID, makeStub, USER_CODE } from "./stub-server.ts";

const stub = makeStub();
let origin: string;

const bare = { HOSTI_URL: undefined, HOSTI_TOKEN: undefined };
const hosti = (args: string[], env: NodeJS.ProcessEnv = {}) =>
  stub.hosti(args, { ...bare, ...env });

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const lastLine = (text: string) => text.trim().split("\n").at(-1);
const configFile = () => path.join(stub.configHome(), "hosti.json");

const pending = {
  status: 200,
  body: { status: "pending", expiresAt: "2999-01-01T00:00:00.000Z", pollAfterSeconds: 1 },
};
const approved = (scopes = ["publish", "share"]) => ({
  status: 200,
  body: { status: "approved", scopes, name: "ci box" },
});

async function savedConfig(file = configFile()): Promise<{ url: string; token: string }> {
  return JSON.parse(await fs.readFile(file, "utf8")) as { url: string; token: string };
}

beforeAll(async () => {
  await stub.start();
  origin = stub.origin();
});

beforeEach(async () => {
  await stub.reset();
});

afterAll(async () => {
  await stub.stop();
});

describe("hosti login", () => {
  it("waits for approval, then saves the token to a 0600 file and never prints it", async () => {
    stub.setPollAnswers([pending, approved()]);
    const result = await hosti(["login", origin, "--name", "ci box"]);
    expect(result.code).toBe(0);

    const lines = result.stdout.split("\n");
    expect(lines).toContain(`${origin}/connect/${CONNECTION_ID}`);
    expect(lines).toContain(USER_CODE);
    expect(result.stdout).toContain("ci box");
    expect(result.stdout).toContain("publish, share");
    expect(result.stdout).toContain(configFile());

    const saved = await savedConfig();
    expect(saved.url).toBe(origin);
    expect(saved.token).toMatch(/^hosti_[A-Za-z0-9_-]{32}$/);
    expect((await fs.stat(configFile())).mode & 0o777).toBe(0o600);
    expect(result.stdout).not.toContain(saved.token);
    expect(result.stderr).not.toContain(saved.token);
    expect(await stub.opened()).toEqual([`${origin}/connect/${CONNECTION_ID}`]);
  });

  it("sends only digests, and the polling secret only in the Authorization header", async () => {
    stub.setPollAnswers([approved()]);
    const result = await hosti(["login", origin, "--name", "ci box"]);
    expect(result.code).toBe(0);
    const { token } = await savedConfig();

    const [create, ...polls] = stub.seen();
    expect(create?.method).toBe("POST");
    const body = JSON.parse(create?.body ?? "{}") as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "pollingDigest",
      "scopes",
      "tokenDigest",
      "tokenName",
    ]);
    expect(body.tokenName).toBe("ci box");
    expect(body.scopes).toEqual(["publish", "share"]);
    expect(body.tokenDigest).toBe(digest(token));
    expect(body.pollingDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(body.pollingDigest).not.toBe(body.tokenDigest);
    expect(create?.authorization).toBe("");

    expect(polls.length).toBeGreaterThan(0);
    const pollingSecret = (polls[0]?.authorization ?? "").replace(/^Bearer /, "");
    expect(digest(pollingSecret)).toBe(body.pollingDigest);
    for (const request of stub.seen()) {
      expect(request.url).not.toContain(token);
      expect(request.url).not.toContain(pollingSecret);
      expect(request.body).not.toContain(token);
      expect(request.body).not.toContain(pollingSecret);
      expect(request.authorization).not.toContain(token);
    }
    expect(result.stdout).not.toContain(pollingSecret);
  });

  it("asks for delete only with --allow-delete", async () => {
    stub.setPollAnswers([approved(["publish", "share"])]);
    const result = await hosti(["login", origin, "--name", "ci box", "--allow-delete"]);
    expect(result.code).toBe(0);
    const body = JSON.parse(stub.seen()[0]?.body ?? "{}") as { scopes: string[] };
    expect(body.scopes).toEqual(["publish", "share", "delete"]);
    expect(result.stdout).toContain("the owner did not grant delete");
  });

  it("names the token <user>@<host>, bent to the name rule, when --name is absent", async () => {
    stub.setPollAnswers([approved()]);
    const result = await hosti(["login", origin]);
    expect(result.code).toBe(0);
    const body = JSON.parse(stub.seen()[0]?.body ?? "{}") as { tokenName: string };
    expect(body.tokenName).toMatch(/^[A-Za-z0-9_\- ]{1,64}$/);
  });

  it("creates the config directory and tightens a file that was readable", async () => {
    const home = path.join(stub.configHome(), "nested", "deeper");
    stub.setPollAnswers([approved()]);
    const fresh = await hosti(["login", origin], { XDG_CONFIG_HOME: home });
    expect(fresh.code).toBe(0);
    const file = path.join(home, "hosti.json");
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);

    await fs.writeFile(
      file,
      JSON.stringify({ url: "https://old.example.com", token: "hosti_old" }),
    );
    await fs.chmod(file, 0o644);
    await stub.reset();
    stub.setPollAnswers([approved()]);
    const again = await hosti(["login", `${origin}/`], { XDG_CONFIG_HOME: home });
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("the saved login for https://old.example.com");
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    expect((await savedConfig(file)).url).toBe(origin);
  });

  it("does not claim to replace a login for the same server", async () => {
    await fs.writeFile(configFile(), JSON.stringify({ url: origin, token: "hosti_old" }));
    stub.setPollAnswers([approved()]);
    const result = await hosti(["login", origin]);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("replaced");
  });

  for (const [status, words] of [
    ["denied", "denied"],
    ["expired", "expired"],
  ] as const) {
    it(`exits 1 on ${status}, says so and saves nothing`, async () => {
      stub.setPollAnswers([pending, { status: 200, body: { status } }]);
      const result = await hosti(["login", origin]);
      expect(result.code).toBe(1);
      expect(lastLine(result.stderr)).toContain(words);
      expect(lastLine(result.stderr)).toContain("hosti login again");
      await expect(fs.stat(configFile())).rejects.toThrow();
    });
  }

  it("exits 1 when the server no longer knows the connection", async () => {
    stub.setPollAnswers([{ status: 404, body: { error: "not_found", message: "gone" } }]);
    const result = await hosti(["login", origin]);
    expect(result.code).toBe(1);
    expect(lastLine(result.stderr)).toContain("no longer knows this connection");
    expect(lastLine(result.stderr)).toContain("hosti login again");
    await expect(fs.stat(configFile())).rejects.toThrow();
  });

  for (const [status, error, message] of [
    [409, "token_exists", "That token digest is already in use"],
    [429, "too_many_pending", "Too many agent connections are waiting"],
    [400, "bad_token_name", "A push token name is letters, digits, dashes"],
  ] as const) {
    it(`prints the server's message when create answers ${status}`, async () => {
      stub.setCreateAnswer({ status, body: { error, message } });
      const result = await hosti(["login", origin]);
      expect(result.code).toBe(1);
      expect(lastLine(result.stderr)).toBe(message);
      expect(stub.seen()).toHaveLength(1);
    });
  }

  it("warns that HOSTI_URL and HOSTI_TOKEN override the saved login", async () => {
    stub.setPollAnswers([approved()]);
    const result = await hosti(["login", origin], {
      HOSTI_URL: "https://elsewhere.example.com",
      HOSTI_TOKEN: "hosti_env",
    });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("HOSTI_URL and HOSTI_TOKEN are set");
    expect(result.stderr).toContain("override the saved login");
  });

  it("stays quiet about the environment when nothing overrides", async () => {
    stub.setPollAnswers([approved()]);
    const result = await hosti(["login", origin]);
    expect(result.stderr).not.toContain("warning");
  });

  it("needs the server URL", async () => {
    const result = await hosti(["login"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("login needs the server URL");
  });

  it("refuses something that is not an http URL before a request leaves", async () => {
    const result = await hosti(["login", "hosti.example.com"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("is not a URL");
    expect(stub.seen()).toHaveLength(0);
  });
});

describe("hosti whoami", () => {
  it("prints the URL, token name and scopes, never the token", async () => {
    stub.setWhoami({ name: "laptop", scopes: ["publish", "share", "delete"] });
    const result = await stub.hosti(["whoami"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(origin);
    expect(result.stdout).toContain("laptop");
    expect(result.stdout).toContain("publish, share, delete");
    expect(result.stdout).not.toContain("hosti_test");
  });

  it("uses the login saved by hosti login", async () => {
    stub.setPollAnswers([approved()]);
    expect((await hosti(["login", origin])).code).toBe(0);
    stub.setWhoami({ name: "ci box", scopes: ["publish", "share"] });
    const result = await hosti(["whoami"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ci box");
  });

  it("stops at exit 2 when nothing is configured", async () => {
    const result = await hosti(["whoami"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("HOSTI_URL");
  });

  it("passes a 401 on, exit 1", async () => {
    const result = await stub.hosti(["whoami"], { HOSTI_TOKEN: "hosti_revoked" });
    expect(result.code).toBe(1);
    expect(lastLine(result.stderr)).toBe("A valid push token is required");
  });
});

describe("hosti logout", () => {
  it("removes the saved login and points at /tokens", async () => {
    await fs.writeFile(configFile(), JSON.stringify({ url: origin, token: "hosti_saved" }));
    const result = await hosti(["logout"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`${origin}/tokens`);
    expect(result.stdout).not.toContain("hosti_saved");
    await expect(fs.stat(configFile())).rejects.toThrow();
  });

  it("keeps any other settings in the file", async () => {
    await fs.writeFile(
      configFile(),
      JSON.stringify({ url: origin, token: "hosti_x", editor: "vi" }),
    );
    const result = await hosti(["logout"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(await fs.readFile(configFile(), "utf8"))).toEqual({ editor: "vi" });
  });

  it("says there was nothing to remove", async () => {
    const result = await hosti(["logout"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no saved login");
  });

  it("warns when the environment still points at a server", async () => {
    const result = await hosti(["logout"], { HOSTI_TOKEN: "hosti_env" });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("HOSTI_TOKEN is set");
  });
});

describe("a missing scope", () => {
  it("prints the server's message last and exits 1", async () => {
    const message =
      'This push token lacks the "delete" scope. The owner can grant it by approving a new connection with `hosti login --allow-delete`.';
    stub.setRefusal({ status: 403, body: { error: "missing_scope", scope: "delete", message } });
    const result = await stub.hosti(["rm", "atlas", "--yes"]);
    expect(result.code).toBe(1);
    expect(lastLine(result.stderr)).toBe(message);
  });
});
