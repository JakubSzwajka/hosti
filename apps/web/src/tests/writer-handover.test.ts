import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./test-fixtures";

import * as api from "./api";
import * as support from "./support";
import { GET as health } from "@/app/api/health/route";
import { GET as ready } from "@/app/internal/deploy/ready/route";
import { GET as smoke } from "@/app/internal/deploy/smoke/route";
import { POST as fenceOn } from "@/app/internal/deploy/fence/on/route";
import { POST as fenceOff } from "@/app/internal/deploy/fence/off/route";
import { GET as whoami } from "@/app/api/v1/whoami/route";
import { POST as upload } from "@/app/upload/route";
import { POST as login } from "@/app/login/submit/route";
import { POST as revoke } from "@/app/tokens/revoke/route";
import { POST as approve } from "@/app/connect/[id]/approve/route";
import { POST as deny } from "@/app/connect/[id]/deny/route";
import { POST as connect } from "@/app/api/v1/agent-authorizations/route";
import { POST as collection } from "@/app/b/[slug]/collection/route";
import { POST as deleteFromCatalog } from "@/app/b/[slug]/delete/route";
import { POST as shareFromCatalog } from "@/app/b/[slug]/sharing/route";
import { POST as rotateFromCatalog } from "@/app/b/[slug]/sharing/rotate/route";
import { PUT as mcpUpload } from "@/app/api/mcp/uploads/[id]/route";

const ORIGIN = "http://localhost:3000";
const NEW_TOKEN = path.resolve(import.meta.dirname, "../../scripts/new-token.mjs");
const SQLITE = path.resolve(import.meta.dirname, "../../node_modules/better-sqlite3");
const detachedDirs: string[] = [];
let dataDir: string;
let token: string;
let shareSlug: string;

const hook = {
  health: (request: Request) => health(request),
  ready: (request: Request) => ready(request),
  smoke: (request: Request) => smoke(request),
  on: (request: Request) => fenceOn(request),
  off: (request: Request) => fenceOff(request),
};
const hookPath = {
  health: "/api/health",
  ready: "/internal/deploy/ready",
  smoke: "/internal/deploy/smoke",
  on: "/internal/deploy/fence/on",
  off: "/internal/deploy/fence/off",
} as const;

function fenceRequest(kind: "on" | "off", epoch: string, body: unknown = { epoch }): Request {
  return support.privateRequest(`${ORIGIN}${hookPath[kind]}`, {
    method: "POST",
    headers: { "X-Small-App-Epoch": epoch },
    body: JSON.stringify(body),
  });
}

async function readiness() {
  return (await ready(support.privateRequest(`${ORIGIN}${hookPath.ready}`))).json();
}

async function restart(): Promise<void> {
  const detached = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-detached-"));
  detachedDirs.push(detached);
  support.restartCatalog(detached);
}

function params<T>(value: T) {
  return { params: Promise.resolve(value) };
}

function form(url: string, fields: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${url}`, { method: "POST", body: new URLSearchParams(fields) });
}

function tokenUse(name: string): string | null {
  return support.listPushTokens().find((row) => row.name === name)?.lastUsedAt ?? null;
}

function stateFile(): Promise<unknown> {
  return fs.readFile(path.join(dataDir, "hosti-writer.json"), "utf8").then(JSON.parse);
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  process.env.HOSTI_SECRET = "synthetic-local-test-secret-not-production";
  token = support.createPushToken("handover").secret;
  shareSlug = await api.pushAndShare(token, "kept", await tarFixture("single-file"));
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
  await Promise.all(detachedDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("private deploy hooks", () => {
  it.each(Object.keys(hookPath) as (keyof typeof hookPath)[])(
    "answers %s only on the private channel",
    async (name) => {
      const spoofed = new Request(`${ORIGIN}${hookPath[name]}`, {
        method: name === "on" || name === "off" ? "POST" : "GET",
        headers: {
          Host: "localhost:3000",
          "X-Forwarded-For": "127.0.0.1",
          "X-Real-IP": "127.0.0.1",
          "X-Small-App-Epoch": "spoofed",
          "X-Hosti-Private-Channel": "guessed-secret-guessed-secret-guessed",
        },
        ...(name === "on" || name === "off" ? { body: JSON.stringify({ epoch: "spoofed" }) } : {}),
      });
      expect((await hook[name](spoofed)).status).toBe(404);
      expect(await readiness()).toEqual({ ready: true, writer: true, schema: "4", epoch: null });
    },
  );

  it("reports health, readiness and a smoke read without writing", async () => {
    const used = tokenUse("handover");
    const healthResponse = await health(support.privateRequest(`${ORIGIN}${hookPath.health}`));
    expect(await healthResponse.json()).toMatchObject({ status: "ok" });
    const smokeResponse = await smoke(support.privateRequest(`${ORIGIN}${hookPath.smoke}`));
    expect(smokeResponse.status).toBe(200);
    expect(await smokeResponse.json()).toEqual({ ok: true, writer: true, schema: "4", bundles: 1 });
    expect(tokenUse("handover")).toBe(used);
    await expect(fs.access(path.join(dataDir, "hosti-writer.json"))).rejects.toThrow();
  });

  it.each([
    ["mismatched header and body", fenceRequest("on", "proof-a", { epoch: "proof-b" })],
    ["an extra body key", fenceRequest("on", "proof-a", { epoch: "proof-a", force: true })],
    [
      "a missing header",
      support.privateRequest(`${ORIGIN}${hookPath.on}`, {
        method: "POST",
        body: JSON.stringify({ epoch: "proof-a" }),
      }),
    ],
  ])("refuses a fence with %s", async (_label, request) => {
    const response = await fenceOn(request);
    expect(response.status).toBe(400);
    expect((await readiness()).writer).toBe(true);
  });
});

describe("fence, drain and handover", () => {
  it("drains an admitted push, pauses every write, keeps reads and survives restart", async () => {
    const archive = await tarFixture("page-with-assets");
    let feed: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        feed = controller;
      },
    });
    const slowPush = api.pushStream(token, "in-flight", body);
    await new Promise((resolve) => setTimeout(resolve, 50));

    let fenceSettled = false;
    const fencing = fenceOn(fenceRequest("on", "proof-epoch-a")).then((response) => {
      fenceSettled = true;
      return response;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fenceSettled).toBe(false);
    expect((await api.push(token, "late", archive)).status).toBe(503);

    feed?.enqueue(new Uint8Array(archive));
    feed?.close();
    expect((await slowPush).status).toBe(201);
    const fenced = await fencing;
    expect(fenced.status).toBe(200);
    expect(await fenced.json()).toEqual({ fenced: true, drained: true, epoch: "proof-epoch-a" });
    expect(await stateFile()).toEqual({
      version: 1,
      owner: null,
      fence: "proof-epoch-a",
      spent: [],
    });

    const before = support.listCatalog().map((bundle) => bundle.slug);
    const used = tokenUse("handover");
    const mutations: [string, () => Promise<Response>][] = [
      ["push", () => api.push(token, "kept", archive)],
      ["set sharing", () => api.setSharing(token, "kept", { mode: "private" })],
      ["rotate", () => api.rotateSharing(token, "kept")],
      ["prune", () => api.prune(token, "kept")],
      ["delete", () => api.removeBundle(token, "kept")],
      ["pin unlock", () => api.unlock(shareSlug, { pin: "1234" })],
      ["catalog upload", () => upload(form("/upload"))],
      ["login", () => login(form("/login/submit", { password: "x" }))],
      ["token revoke", () => revoke(form("/tokens/revoke", { id: "1" }))],
      ["connection approve", () => approve(form("/connect/x/approve"), params({ id: "x" }))],
      ["connection deny", () => deny(form("/connect/x/deny"), params({ id: "x" }))],
      ["agent connection", () => connect(form("/api/v1/agent-authorizations"))],
      ["collection", () => collection(form("/b/kept/collection"), params({ slug: "kept" }))],
      ["catalog delete", () => deleteFromCatalog(form("/b/kept/delete"), params({ slug: "kept" }))],
      ["catalog share", () => shareFromCatalog(form("/b/kept/sharing"), params({ slug: "kept" }))],
      [
        "catalog rotate",
        () => rotateFromCatalog(form("/b/kept/sharing/rotate"), params({ slug: "kept" })),
      ],
      [
        "transfer upload",
        () =>
          mcpUpload(
            new Request(`${ORIGIN}/api/mcp/uploads/x`, { method: "PUT", body: "x" }),
            params({ id: "x" }),
          ),
      ],
    ];
    for (const [label, mutate] of mutations) {
      const response = await mutate();
      expect([label, response.status, response.headers.get("retry-after")]).toEqual([
        label,
        503,
        "5",
      ]);
    }

    expect((await api.getBundle(token, "kept")).status).toBe(200);
    expect((await api.serve(`/v/${shareSlug}/`)).status).toBe(200);
    const identity = await whoami(
      new Request(`${ORIGIN}/api/v1/whoami`, { headers: { Authorization: `Bearer ${token}` } }),
    );
    expect(identity.status).toBe(200);
    expect(tokenUse("handover")).toBe(used);
    expect(support.listCatalog().map((bundle) => bundle.slug)).toEqual(before);
    expect(await readiness()).toEqual({ ready: true, writer: false, schema: "4", epoch: null });
    expect((await fenceOn(fenceRequest("on", "proof-epoch-a"))).status).toBe(200);

    await restart();
    expect(await readiness()).toEqual({ ready: true, writer: false, schema: "4", epoch: null });
    expect((await api.serve(`/v/${shareSlug}/`)).status).toBe(200);
    expect((await api.push(token, "kept", archive)).status).toBe(503);
    expect((await fenceOn(fenceRequest("on", "proof-epoch-b"))).status).toBe(409);

    const unfenced = await fenceOff(fenceRequest("off", "proof-epoch-a"));
    expect(await unfenced.json()).toEqual({ fenced: false, epoch: "proof-epoch-a" });
    expect((await fenceOff(fenceRequest("off", "proof-epoch-a"))).status).toBe(200);
    const late = await fenceOn(fenceRequest("on", "proof-epoch-a"));
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ error: "epoch_spent" });
    expect((await readiness()).writer).toBe(true);
    expect((await api.push(token, "after-rollback", archive)).status).toBe(201);
    expect(await stateFile()).toEqual({
      version: 1,
      owner: null,
      fence: null,
      spent: ["proof-epoch-a"],
    });
  });

  it("stays a reader while another process holds the volume lease", async () => {
    await restart();
    const holder = spawn(
      process.execPath,
      [
        "-e",
        `const D=require(${JSON.stringify(SQLITE)});const l=new D(process.argv[1],{timeout:0});` +
          `l.pragma("locking_mode = EXCLUSIVE");l.transaction(()=>{}).exclusive();` +
          `process.stdout.write("held\\n");process.stdin.on("end",()=>process.exit(0));process.stdin.resume();`,
        path.join(dataDir, "hosti-writer.lease"),
      ],
      { stdio: ["pipe", "pipe", "inherit"] },
    );
    await new Promise<void>((resolve) => holder.stdout.once("data", () => resolve()));
    try {
      expect(await readiness()).toMatchObject({ ready: true, writer: false });
      expect((await api.push(token, "blocked", await tarFixture("single-file"))).status).toBe(503);
      expect((await api.serve(`/v/${shareSlug}/`)).status).toBe(200);
    } finally {
      holder.stdin.end();
      await new Promise((resolve) => holder.once("exit", resolve));
    }
    expect((await readiness()).writer).toBe(true);
  });

  it("refuses token:new while this server owns the volume", async () => {
    expect((await readiness()).writer).toBe(true);
    const result = spawnSync(process.execPath, [NEW_TOKEN, "--name", "cli"], {
      env: { ...process.env, HOSTI_DATA_DIR: dataDir },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("A running Hosti server owns");
    expect(support.listPushTokens().some((row) => row.name === "cli")).toBe(false);
  });
});
