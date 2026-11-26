import fs from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { afterAll, beforeAll, expect } from "vitest";
import { tarFixture, useTempDataDir } from "./test-fixtures";
import { POST, DELETE } from "@/app/mcp/route";
import { PUT } from "@/app/api/mcp/uploads/[id]/route";
import { GET as download } from "@/app/api/mcp/downloads/[id]/route";

export const base = "http://localhost:3000";
export const owner = "user_test_owner";
export const clientId = "test-client";
let issuer: Server;
export let issuerUrl: string;
export let keys: Awaited<ReturnType<typeof generateKeyPair>>;
export let otherKeys: Awaited<ReturnType<typeof generateKeyPair>>;
export let jwks: { keys: object[] };
export let dataDir: string;
export let token: string;
export let session: string;
let counter = 0;
const saved = { ...process.env };
const sessions: string[] = [];

export async function signed(overrides: Record<string, unknown> = {}, key = keys.privateKey) {
  return new SignJWT({
    iss: issuerUrl,
    aud: `${base}/mcp`,
    sub: owner,
    client_id: clientId,
    scope: "email",
    exp: Math.floor(Date.now() / 1000) + 600,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: key === keys.privateKey ? "first" : "other" })
    .sign(key);
}

export async function rpc(
  method: string,
  params: object = {},
  auth = token,
  id = session,
  headers: Record<string, string> = {},
) {
  return POST(
    new Request(`${base}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...(id ? { "mcp-session-id": id, "mcp-protocol-version": "2025-03-26" } : {}),
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++counter, method, params }),
    }),
  );
}

export async function initialize(auth = token, name = "  Hosti\n MCP proof  ") {
  const response = await rpc(
    "initialize",
    {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name, version: "1" },
    },
    auth,
    "",
  );
  const id = response.headers.get("mcp-session-id");
  if (id) sessions.push(id);
  return { response, id };
}

export async function call(name: string, args: object = {}) {
  const response = await rpc("tools/call", { name, arguments: args });
  expect(response.status).toBe(200);
  const text = await response.text();
  const json = JSON.parse(
    text.startsWith("event:") || text.startsWith("data:")
      ? (text
          .split("\n")
          .find((line) => line.startsWith("data:"))
          ?.slice(5) ?? "{}")
      : text,
  );
  if (json.error) throw new Error(JSON.stringify(json.error));
  return JSON.parse(json.result.content[0].text);
}

function context(url: string) {
  return { params: Promise.resolve({ id: new URL(url).pathname.split("/").pop() ?? "" }) };
}
export async function upload(url: string, bytes: Buffer, headers: Record<string, string> = {}) {
  return PUT(
    new Request(url, { method: "PUT", body: new Uint8Array(bytes), headers }),
    context(url),
  );
}
export async function pull(url: string) {
  return download(new Request(url), context(url));
}
export async function publish(slug: string, fixture = "single-file") {
  const grant = await call("push", { slug, title: "MCP bundle", collection: "tests" });
  const response = await upload(grant.url, await tarFixture(fixture));
  expect(response.status).toBe(201);
  return grant;
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  keys = await generateKeyPair("RS256");
  otherKeys = await generateKeyPair("RS256");
  jwks = { keys: [{ ...(await exportJWK(keys.publicKey)), kid: "first", alg: "RS256" }] };
  issuer = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(jwks));
  });
  await new Promise<void>((resolve) => issuer.listen(0, "127.0.0.1", resolve));
  const address = issuer.address();
  if (!address || typeof address === "string") throw new Error("Missing issuer address");
  issuerUrl = `http://127.0.0.1:${address.port}`;
  process.env.CLERK_ISSUER = issuerUrl;
  process.env.HOSTI_MCP_URL = `${base}/mcp`;
  process.env.HOSTI_OWNER_CLERK_USER_ID = owner;
  process.env.HOSTI_MCP_DELETE_CLIENT_IDS = "";
  process.env.HOSTI_SECRET = "synthetic-local-test-secret-not-production";
  process.env.HOSTI_KEEP_REVISIONS = "2";
  token = await signed();
  const initialized = await initialize();
  expect(initialized.response.status).toBe(200);
  expect(initialized.id).toBeTruthy();
  session = initialized.id ?? "";
});

afterAll(async () => {
  for (const id of sessions) {
    await DELETE(
      new Request(`${base}/mcp`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "mcp-session-id": id },
      }),
    );
  }
  await new Promise<void>((resolve, reject) =>
    issuer.close((error) => (error ? reject(error) : resolve())),
  );
  for (const key of [
    "CLERK_ISSUER",
    "HOSTI_MCP_URL",
    "HOSTI_OWNER_CLERK_USER_ID",
    "HOSTI_MCP_DELETE_CLIENT_IDS",
    "HOSTI_SECRET",
    "HOSTI_KEEP_REVISIONS",
    "HOSTI_DATA_DIR",
  ]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await fs.rm(dataDir, { recursive: true, force: true });
});
