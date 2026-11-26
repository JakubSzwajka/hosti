import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { create, extract } from "tar";

export function check(condition, label) {
  if (!condition) throw new Error(label);
}
export async function setupProof() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-mcp-proof-"));
  const keys = await generateKeyPair("RS256");
  const publicKey = { ...(await exportJWK(keys.publicKey)), kid: "proof", alg: "RS256" };
  const issuer = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ keys: [publicKey] }));
  });
  issuer.listen(0, "127.0.0.1");
  await once(issuer, "listening");
  const issuerAddress = issuer.address();
  check(issuerAddress && typeof issuerAddress !== "string", "issuer listening");
  const issuerUrl = `http://127.0.0.1:${issuerAddress.port}`;
  const portProbe = createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const appAddress = portProbe.address();
  check(appAddress && typeof appAddress !== "string", "free application port");
  await new Promise((resolve) => portProbe.close(resolve));
  const base = `http://127.0.0.1:${appAddress.port}`;
  const require = createRequire(import.meta.url);
  const nextBin = require.resolve("next/dist/bin/next");
  let server;
  let session;
  let sequence = 0;
  const env = {
    ...process.env,
    HOSTI_DATA_DIR: path.join(root, "data"),
    HOSTI_SECRET: randomBytes(32).toString("hex"),
    HOSTI_OWNER_PASSWORD_HASH: "",
    HOSTI_PUBLIC_URL: base,
    HOSTI_MCP_URL: `${base}/mcp`,
    CLERK_ISSUER: issuerUrl,
    HOSTI_OWNER_CLERK_USER_ID: "user_proof_owner",
    HOSTI_MCP_DELETE_CLIENT_IDS: "",
    HOSTI_KEEP_REVISIONS: "2",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  async function sign(claims = {}) {
    return new SignJWT({
      iss: issuerUrl,
      aud: `${base}/mcp`,
      sub: "user_proof_owner",
      client_id: "proof-client",
      scope: "email",
      exp: Math.floor(Date.now() / 1000) + 600,
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "proof" })
      .sign(keys.privateKey);
  }
  async function start(allowDelete = false) {
    env.HOSTI_MCP_DELETE_CLIENT_IDS = allowDelete ? "proof-client" : "";
    server = spawn(
      process.execPath,
      [nextBin, "start", "--hostname", "0.0.0.0", "--port", String(appAddress.port)],
      {
        cwd: path.resolve(import.meta.dirname, ".."),
        env,
        stdio: ["ignore", "ignore", "ignore"],
      },
    );
    const end = Date.now() + 120_000;
    while (Date.now() < end) {
      check(server.exitCode === null, "Next server remains running");
      const healthy = await fetch(`${base}/api/health`)
        .then((r) => r.status === 200)
        .catch(() => false);
      if (healthy) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Next health readiness timeout");
  }
  async function stop() {
    if (server && server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    }
    session = undefined;
  }
  async function interruptUpload(url) {
    const id = new URL(url).pathname.split("/").pop();
    const request = httpRequest(
      url,
      {
        method: "PUT",
        headers: { "Content-Type": "application/gzip", "Content-Length": "1000000" },
      },
      (response) => response.resume(),
    );
    request.on("error", () => undefined);
    request.write((await fs.readFile(archive)).subarray(0, 20));
    try {
      const marker = path.join(root, "data", "mcp-transfers", `${id}.used`);
      const end = Date.now() + 10_000;
      let reserved = false;
      while (Date.now() < end) {
        reserved = await fs
          .stat(marker)
          .then(() => true)
          .catch(() => false);
        if (reserved) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      check(reserved, "interrupted upload reserved before process termination");
      const exited = once(server, "exit");
      server.kill("SIGKILL");
      await exited;
      session = undefined;
    } finally {
      request.destroy();
    }
  }
  async function rpc(method, params = {}, credential, sessionId = session) {
    const token = credential === undefined ? await sign() : credential;
    return fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(sessionId ? { "mcp-session-id": sessionId, "mcp-protocol-version": "2025-03-26" } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++sequence, method, params }),
    });
  }
  async function initialize() {
    const response = await rpc(
      "initialize",
      {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "Hosti MCP proof", version: "1" },
      },
      undefined,
      "",
    );
    check(response.status === 200, "authenticated initialize");
    session = response.headers.get("mcp-session-id");
    check(session, "MCP session issued");
    await response.text();
  }
  async function call(name, args = {}) {
    const response = await rpc("tools/call", { name, arguments: args });
    check(response.status === 200, `tool HTTP status: ${name}`);
    const body = await response.text();
    const frame =
      body.startsWith("event:") || body.startsWith("data:")
        ? body
            .split("\n")
            .find((line) => line.startsWith("data:"))
            ?.slice(5)
        : body;
    const decoded = JSON.parse(frame ?? "{}");
    check(!decoded.error, `tool protocol result: ${name}`);
    return JSON.parse(decoded.result.content[0].text);
  }
  async function curl(url, method, input, output) {
    const args = [
      "--silent",
      "--show-error",
      "--config",
      "-",
      "--request",
      method,
      "--write-out",
      "\n%{http_code}",
    ];
    if (input) args.push("--upload-file", input, "--header", "Content-Type: application/gzip");
    if (output) args.push("--output", output);
    const child = spawn("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.resume();
    child.stdin.end(`url = "${url}"\n`);
    const [code] = await once(child, "exit");
    check(code === 0, "curl process");
    const text = Buffer.concat(chunks).toString("utf8");
    const split = text.lastIndexOf("\n");
    return { status: Number(text.slice(split + 1)), body: text.slice(0, split) };
  }
  const files = {
    "index.html": Buffer.from("<!doctype html><h1>Hosti MCP isolated proof</h1>"),
    "nested/note.txt": Buffer.from("known nested text\n"),
    "asset.bin": Buffer.from([0, 1, 2, 127, 128, 254, 255]),
  };
  const hashes = Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [
      name,
      createHash("sha256").update(bytes).digest("hex"),
    ]),
  );
  const source = path.join(root, "source");
  for (const [name, bytes] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(source, name)), { recursive: true });
    await fs.writeFile(path.join(source, name), bytes);
  }
  const archive = path.join(root, "fixture.tar.gz");
  await create({ gzip: true, portable: true, cwd: source, file: archive }, ["."]);
  async function verifyDownload(url) {
    const output = path.join(root, `download-${sequence}.tar.gz`);
    check((await curl(url, "GET", undefined, output)).status === 200, "curl download status");
    const destination = await fs.mkdtemp(path.join(root, "unpack-"));
    await extract({ cwd: destination, file: output });
    for (const [name, expected] of Object.entries(hashes)) {
      const bytes = await fs.readFile(path.join(destination, name));
      check(
        createHash("sha256").update(bytes).digest("hex") === expected,
        `download hash: ${name}`,
      );
    }
  }
  return {
    root,
    base,
    issuerUrl,
    archive,
    start,
    stop,
    sign,
    rpc,
    initialize,
    call,
    curl,
    verifyDownload,
    interruptUpload,
    async cleanup() {
      await stop();
      await new Promise((resolve) => issuer.close(resolve));
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}
