import { createHash, randomBytes } from "node:crypto";
import os from "node:os";
import type { AgentAuthorizationStatusResponse, PushScope } from "@hosti/shared";
import type { Flags } from "./args.ts";
import { ApiError, type ConnectionClient, createConnectionClient } from "./client.ts";
import { CommandError } from "./commands.ts";
import { envOverrides, removeLogin, saveLogin } from "./config.ts";
import { say, type Writer } from "./output.ts";

const TOKEN_PREFIX = "hosti_";
const TOKEN_NAME_MAX_LENGTH = 64;
const DISALLOWED_NAME_CHARACTERS = /[^A-Za-z0-9_\- ]/g;

const DEFAULT_POLL_SECONDS = 2;
const MIN_POLL_SECONDS = 1;
const MAX_POLL_SECONDS = 30;

const AGAIN = "Run hosti login again to ask once more.";

export type LoginContext = {
  target: string;
  flags: Flags;
  out: Writer;
  err: Writer;
  env: NodeJS.ProcessEnv;
  openUrl: (url: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random?: (size: number) => Buffer;
  connect?: (base: string) => ConnectionClient;
};

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function makeSecrets(random: (size: number) => Buffer = randomBytes): {
  token: string;
  pollingSecret: string;
} {
  // The same shape as the catalog's own tokens in packages/identity/src/push-tokens.ts.
  return {
    token: `${TOKEN_PREFIX}${random(24).toString("base64url")}`,
    pollingSecret: random(32).toString("base64url"),
  };
}

function machineUser(): string {
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USER ?? "agent";
  }
}

export function defaultTokenName(user = machineUser(), host = os.hostname()): string {
  const name = `${user}@${host}`
    .replace(DISALLOWED_NAME_CHARACTERS, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-\s]+|[-\s]+$/g, "")
    .slice(0, TOKEN_NAME_MAX_LENGTH)
    .trim();
  return name || "hosti-cli";
}

export function normalizeServerUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new CommandError(`${raw} is not a URL. Try: hosti login https://hosti.example.com`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new CommandError(`${raw} is not an http or https URL`);
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

function pollSeconds(asked: unknown): number {
  const seconds =
    typeof asked === "number" && Number.isFinite(asked) ? asked : DEFAULT_POLL_SECONDS;
  return Math.min(MAX_POLL_SECONDS, Math.max(MIN_POLL_SECONDS, seconds));
}

function clock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toTimeString().slice(0, 5);
}

function warnOverrides(err: Writer, env: NodeJS.ProcessEnv, what: string): void {
  const names = envOverrides(env);
  if (names.length === 0) return;
  const verb = names.length === 1 ? "is" : "are";
  say(err, "warning", `${names.join(" and ")} ${verb} set in the environment and ${what}`);
}

async function waitForAnswer(
  context: LoginContext,
  client: ConnectionClient,
  id: string,
  pollingSecret: string,
  first: { pollAfterSeconds: number; expiresAt: string },
): Promise<Extract<AgentAuthorizationStatusResponse, { status: "approved" }>> {
  let interval = pollSeconds(first.pollAfterSeconds);
  let expiresAt = Date.parse(first.expiresAt);
  let warnedUnreachable = false;

  for (;;) {
    await context.sleep(interval * 1000);

    let answer: AgentAuthorizationStatusResponse;
    try {
      answer = await client.poll(id, pollingSecret);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.status === 404) {
        throw new CommandError(
          `The server no longer knows this connection; it may have restarted or dropped it. ${AGAIN}`,
        );
      }
      // A blip on the network or the server should not throw away the owner's approval.
      if (error.status !== 0 && error.status < 500) throw error;
      if (!warnedUnreachable) say(context.err, "retrying", error.message);
      warnedUnreachable = true;
      if (Number.isFinite(expiresAt) && context.now() >= expiresAt) {
        throw new CommandError(`The connection expired before anyone approved it. ${AGAIN}`);
      }
      continue;
    }

    switch (answer.status) {
      case "approved":
        return answer;
      case "denied":
        throw new CommandError(`The owner denied this connection. ${AGAIN}`);
      case "expired":
        throw new CommandError(`The connection expired before anyone approved it. ${AGAIN}`);
      case "pending":
        interval = pollSeconds(answer.pollAfterSeconds);
        if (answer.expiresAt) expiresAt = Date.parse(answer.expiresAt);
        if (Number.isFinite(expiresAt) && context.now() >= expiresAt) {
          throw new CommandError(`The connection expired before anyone approved it. ${AGAIN}`);
        }
        break;
      default:
        throw new CommandError(
          `The server answered with a status this CLI does not know. ${AGAIN}`,
        );
    }
  }
}

export async function login(context: LoginContext): Promise<void> {
  const { flags, out, err, env } = context;
  const base = normalizeServerUrl(context.target);
  const name = flags.name?.trim() || defaultTokenName();
  const scopes: PushScope[] = flags.allowDelete
    ? ["publish", "share", "delete"]
    : ["publish", "share"];

  // The clear token and polling secret stay on this machine; only digests leave.
  const { token, pollingSecret } = makeSecrets(context.random);
  const client = (context.connect ?? createConnectionClient)(base);
  const created = await client.create({
    tokenName: name,
    tokenDigest: sha256Hex(token),
    pollingDigest: sha256Hex(pollingSecret),
    scopes,
  });

  out("Open this link in a browser where you are the Hosti owner:");
  out(created.approvalUrl);
  out("Check that the page shows this code, then approve:");
  out(created.userCode);
  say(out, "waiting", `for approval of "${name}", until ${clock(created.expiresAt)}`);
  context.openUrl(created.approvalUrl);

  const approved = await waitForAnswer(context, client, created.id, pollingSecret, created);

  const saved = saveLogin({ url: base, token }, env);
  if (saved.replacedBroken) say(out, "replaced", `${saved.file}, which was not valid JSON`);
  else if (saved.previousUrl && saved.previousUrl !== base) {
    say(out, "replaced", `the saved login for ${saved.previousUrl}`);
  }
  say(out, "saved", saved.file);
  say(out, "token", approved.name);
  say(out, "scopes", approved.scopes.join(", "));
  if (flags.allowDelete && !approved.scopes.includes("delete")) {
    say(out, "note", "the owner did not grant delete");
  }
  warnOverrides(err, env, "override the saved login; unset them to use it");
}

export type LogoutContext = { out: Writer; err: Writer; env: NodeJS.ProcessEnv };

export function logout(context: LogoutContext): void {
  const { out, err, env } = context;
  const removed = removeLogin(env);
  if (!removed.removed) {
    say(out, "nothing", `no saved login in ${removed.file}`);
  } else {
    say(out, "removed", `the saved login${removed.url ? ` for ${removed.url}` : ""}`);
    say(out, "from", removed.file);
    const where = removed.url ? `${removed.url}/tokens` : "the catalog's /tokens page";
    say(out, "revoke", `the token still works until the owner revokes it at ${where}`);
  }
  warnOverrides(err, env, "still point commands at a server");
}
