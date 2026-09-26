import { createHash, randomBytes } from "node:crypto";
import type { PushScope } from "@hosti/shared";
import { POST as CREATE } from "@/app/api/v1/agent-authorizations/route";
import { GET as POLL } from "@/app/api/v1/agent-authorizations/[id]/route";
import { POST as APPROVE } from "@/app/connect/[id]/approve/route";
import { POST as DENY } from "@/app/connect/[id]/deny/route";
import { SESSION_COOKIE } from "./support";

const ORIGIN = "http://127.0.0.1:3000";

export const secrets: string[] = [];
export const seen: string[] = [];

const owner = { cookie: "", token: "" };

export function useOwner(cookie: string, token: string): void {
  owner.cookie = cookie;
  owner.token = token;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export type Agent = {
  tokenSecret: string;
  pollingSecret: string;
  body: {
    tokenName: string;
    tokenDigest: string;
    pollingDigest: string;
    scopes: PushScope[];
  };
};

export function agent(name: string, scopes: PushScope[] = ["publish", "share"]): Agent {
  const tokenSecret = `hosti_${randomBytes(24).toString("base64url")}`;
  const pollingSecret = randomBytes(24).toString("base64url");
  secrets.push(tokenSecret, pollingSecret);
  return {
    tokenSecret,
    pollingSecret,
    body: {
      tokenName: name,
      tokenDigest: sha256(tokenSecret),
      pollingDigest: sha256(pollingSecret),
      scopes,
    },
  };
}

export async function record(response: Response): Promise<Response> {
  const text = await response.clone().text();
  seen.push(`${response.status} ${response.headers.get("location") ?? ""}\n${text}`);
  return response;
}

export function create(body: unknown): Promise<Response> {
  return CREATE(
    new Request(`${ORIGIN}/api/v1/agent-authorizations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  ).then(record);
}

export async function connect(one: Agent): Promise<{ id: string; userCode: string }> {
  const response = await create(one.body);
  if (response.status !== 201) throw new Error(await response.text());
  return (await response.json()) as { id: string; userCode: string };
}

export function poll(id: string, secret?: string): Promise<Response> {
  const headers = new Headers();
  if (secret !== undefined) headers.set("authorization", `Bearer ${secret}`);
  return POLL(new Request(`${ORIGIN}/api/v1/agent-authorizations/${id}`, { headers }), {
    params: Promise.resolve({ id }),
  }).then(record);
}

export async function pollBody(id: string, secret: string): Promise<unknown> {
  return (await poll(id, secret)).json();
}

export function form(
  action: "approve" | "deny",
  id: string,
  fields: [string, string][],
  options: { cookie?: boolean; bearer?: string } = {},
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (options.cookie ?? true) headers.set("cookie", `${SESSION_COOKIE}=${owner.cookie}`);
  if (options.bearer) headers.set("authorization", `Bearer ${options.bearer}`);
  const handler = action === "approve" ? APPROVE : DENY;
  return handler(
    new Request(`${ORIGIN}/connect/${id}/${action}`, {
      method: "POST",
      headers,
      body: new URLSearchParams(fields),
    }),
    { params: Promise.resolve({ id }) },
  ).then(record);
}

export const approve = (id: string, scopes: PushScope[] = ["publish", "share"]) =>
  form("approve", id, [
    ["token", owner.token],
    ...scopes.map((scope): [string, string] => ["scope", scope]),
  ]);
export const deny = (id: string) => form("deny", id, [["token", owner.token]]);
