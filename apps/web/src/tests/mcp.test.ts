import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { exportJWK } from "jose";
import { describe, expect, it, vi } from "vitest";
import { makeTar, tarFixture } from "./test-fixtures";
import {
  base,
  owner,
  clientId,
  issuerUrl,
  otherKeys,
  jwks,
  dataDir,
  token,
  session,
  signed,
  rpc,
  initialize,
  call,
  upload,
  pull,
  publish,
} from "./mcp-fixture";
import { HEAD } from "@/app/api/mcp/downloads/[id]/route";
import { GET as metadata } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as nestedMetadata } from "@/app/.well-known/oauth-protected-resource/mcp/route";

describe("MCP security and metadata", () => {
  it("publishes fixed discovery metadata on both paths", async () => {
    const first = metadata();
    expect(first.headers.get("access-control-allow-origin")).toBe("*");
    expect(await first.json()).toEqual({
      resource: `${base}/mcp`,
      authorization_servers: [issuerUrl],
      bearer_methods_supported: ["header"],
      scopes_supported: ["email"],
      resource_name: "Hosti",
    });
    expect(await nestedMetadata().json()).toEqual(await metadata().json());
  });

  it.each([
    ["no credential", {}, 401, ""],
    ["other owner", { sub: "user_other" }, 403],
    ["wrong audience", { aud: "https://other.example/mcp" }, 401],
    ["wrong issuer", { iss: "https://other.example" }, 401],
    ["expired", { exp: 1 }, 401],
    ["no expiry", { exp: undefined }, 401],
    ["no client", { client_id: "" }, 401],
    ["empty subject", { sub: "" }, 401],
    ["array audience", { aud: [`${base}/mcp`, "https://other.example"] }, 401],
    ["nonnumeric expiry", { exp: "later" }, 401],
    ["no email scope", { scope: "profile" }, 403],
    ["web session", { sid: "sess_browser" }, 401],
    ["delegation", { act: {} }, 401],
  ] as const)(
    "refuses %s before tool execution",
    async (_label, claims, status, credential = undefined) => {
      const response = await rpc("tools/list", {}, credential === "" ? "" : await signed(claims));
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      if (status === 401)
        expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
    },
  );

  it("rejects wrong signatures, push credentials, cookies and foreign origins", async () => {
    expect((await initialize(await signed({}, otherKeys.privateKey))).response.status).toBe(401);
    expect((await initialize("hosti_fake_push_token")).response.status).toBe(401);
    expect(
      (await rpc("tools/list", {}, "", session, { Cookie: "hosti_admin=anything" })).status,
    ).toBe(401);
    expect(
      (await rpc("tools/list", {}, token, session, { Origin: "https://evil.example" })).status,
    ).toBe(403);
    expect((await rpc("tools/list", {}, await signed({ client_id: "other-client" }))).status).toBe(
      403,
    );
  });

  it("accepts signing key rotation after JWKS cooldown and applies expiry tolerance", async () => {
    jwks.keys.push({ ...(await exportJWK(otherKeys.publicKey)), kid: "other", alg: "RS256" });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 31_000);
      const rotated = await initialize(await signed({}, otherKeys.privateKey));
      expect(rotated.response.status).toBe(200);
      const now = Math.floor(Date.now() / 1000);
      expect((await initialize(await signed({ exp: now - 4 }))).response.status).toBe(200);
      expect((await initialize(await signed({ exp: now - 6 }))).response.status).toBe(401);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds MCP metadata before executing tools", async () => {
    const response = await rpc("tools/call", {
      name: "push",
      arguments: { slug: "mcp-oversized", title: "x".repeat(65536) },
    });
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed when MCP configuration disappears", async () => {
    delete process.env.HOSTI_OWNER_CLERK_USER_ID;
    try {
      expect((await rpc("tools/list")).status).toBe(401);
    } finally {
      process.env.HOSTI_OWNER_CLERK_USER_ID = owner;
    }
  });
});

describe("MCP tools and binary transfers", () => {
  it("lists tools, publishes through a capability and records declared normalized attribution", async () => {
    const listed = await rpc("tools/list");
    expect(listed.status).toBe(200);
    expect(await listed.text()).toContain('"push"');
    expect(await call("list_bundles")).toEqual({ bundles: [], nextOffset: null });
    const grant = await publish("mcp-main");
    const shown = await call("get_bundle", { slug: "mcp-main" });
    expect(shown.bundle.sharing.mode).toBe("private");
    expect(shown.revisions[0].pushedBy).toBe("mcp:Hosti MCP proof");
    expect(JSON.stringify(shown)).not.toContain("pin_hash");
    expect((await call("list_bundles", { collection: "tests", limit: 1 })).bundles).toHaveLength(1);
    expect((await upload(grant.url, await tarFixture("single-file"))).status).toBe(409);
  });

  it("pins current at issue and rejects tampering and method confusion", async () => {
    await publish("mcp-main");
    const grant = await call("get_download_link", { slug: "mcp-main" });
    await publish("mcp-main", "multi-page");
    const response = await pull(grant.url);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-hosti-revision")).toBe("1");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(
      gunzipSync(Buffer.from(await response.arrayBuffer())).includes(Buffer.from("Sleep vs")),
    ).toBe(true);
    const again = await pull(grant.url);
    expect(again.status).toBe(200);
    await again.arrayBuffer();
    expect((await pull(grant.url.replace("sig=", "sig=x"))).status).toBe(404);
    expect(HEAD().status).toBe(405);
    expect((await upload(grant.url, await tarFixture("single-file"))).status).toBe(404);
  });

  it("consumes a concurrent upload once and recovers after invalid archives", async () => {
    const grant = await call("push", { slug: "mcp-race" });
    const bytes = await tarFixture("single-file");
    const results = await Promise.all([upload(grant.url, bytes), upload(grant.url, bytes)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const bad = await call("push", { slug: "mcp-race" });
    expect((await upload(bad.url, Buffer.from("not gzip"))).status).toBe(400);
    expect((await upload(bad.url, bytes)).status).toBe(409);
    expect((await call("get_bundle", { slug: "mcp-race" })).bundle.currentRevision.seq).toBe(1);
    await publish("mcp-race");
    expect((await call("get_bundle", { slug: "mcp-race" })).bundle.currentRevision.seq).toBe(2);
  });

  it("validates metadata before issuing grants and bounds compressed uploads", async () => {
    expect((await call("push", { slug: "../outside" })).error).toBe("bad_metadata");
    expect((await call("push", { slug: "mcp-main", collection: "-" })).error).toBe("bad_metadata");
    const grant = await call("push", { slug: "mcp-limit" });
    expect(
      (
        await upload(grant.url, Buffer.from("x"), {
          "Content-Length": String(50 * 1024 * 1024 + 1),
        })
      ).status,
    ).toBe(413);
    expect((await call("get_bundle", { slug: "mcp-limit" })).error).toBe("not_found");
  });

  it("enforces streamed compressed size, file size and file count limits", async () => {
    const fixture = await tarFixture("single-file");
    const compressed = await call("push", { slug: "mcp-compressed" });
    const overLimit = Buffer.concat([fixture, Buffer.alloc(50 * 1024 * 1024)]);
    expect((await upload(compressed.url, overLimit)).status).toBe(413);
    const fileGrant = await call("push", { slug: "mcp-large-file" });
    const largeFile = makeTar([{ name: "index.html", content: "x".repeat(20 * 1024 * 1024 + 1) }]);
    const refusedFile = await upload(fileGrant.url, largeFile);
    expect(refusedFile.status).toBe(400);
    expect((await refusedFile.json()).error).toBe("file_too_large");
    const countGrant = await call("push", { slug: "mcp-many-files" });
    const files = makeTar(
      Array.from({ length: 2001 }, (_, i) => ({
        name: i === 0 ? "index.html" : `file-${i}.txt`,
        content: "x",
      })),
    );
    const refusedCount = await upload(countGrant.url, files);
    expect(refusedCount.status).toBe(400);
    expect((await refusedCount.json()).error).toBe("too_many_files");
  });

  it("refuses unsafe archives and expiry without moving current", async () => {
    await publish("mcp-race");
    const grant = await call("push", { slug: "mcp-unsafe" });
    const unsafe = makeTar([{ name: "../escape.html", content: "bad" }]);
    expect((await upload(grant.url, unsafe)).status).toBe(400);
    expect(await fs.stat(path.join(dataDir, "escape.html")).catch(() => null)).toBeNull();
    const expiring = await call("push", { slug: "mcp-expired" });
    const id = new URL(expiring.url).pathname.split("/").pop() ?? "";
    const file = path.join(dataDir, "mcp-transfers", `${id}.json`);
    const state = JSON.parse(await fs.readFile(file, "utf8"));
    await fs.writeFile(file, JSON.stringify({ ...state, expiresAt: 1 }));
    expect((await upload(expiring.url, await tarFixture("single-file"))).status).toBe(404);
    const downloadGrant = await call("get_download_link", { slug: "mcp-race" });
    const downloadId = new URL(downloadGrant.url).pathname.split("/").pop() ?? "";
    const downloadFile = path.join(dataDir, "mcp-transfers", `${downloadId}.json`);
    const downloadState = JSON.parse(await fs.readFile(downloadFile, "utf8"));
    await fs.writeFile(downloadFile, JSON.stringify({ ...downloadState, expiresAt: 1 }));
    expect((await pull(downloadGrant.url)).status).toBe(404);
  });

  it("preserves sharing and pin semantics through rotate and private transitions", async () => {
    await publish("mcp-main");
    const linked = await call("set_sharing", { slug: "mcp-main", mode: "link" });
    const rotated = await call("rotate_link", { slug: "mcp-main" });
    expect(rotated.sharing.mode).toBe("link");
    expect(rotated.shareUrl).not.toBe(linked.shareUrl);
    const pinned = await call("set_sharing", { slug: "mcp-main", mode: "pin", pin: "4821" });
    expect(pinned.sharing.hasPin).toBe(true);
    expect(JSON.stringify(pinned)).not.toContain("4821");
    const privateState = await call("set_sharing", { slug: "mcp-main", mode: "private" });
    expect(privateState.sharing.hasPin).toBe(false);
    expect(privateState.shareUrl).toBeNull();
  });

  it("denies pruned targets and enforces delete allowlist plus explicit confirmation", async () => {
    await publish("mcp-main");
    await publish("mcp-main");
    const old = await call("get_download_link", { slug: "mcp-main", revision: 1 });
    await publish("mcp-main");
    expect((await call("prune", { slug: "mcp-main" })).kept).toEqual([3, 2]);
    expect((await pull(old.url)).status).toBe(404);
    expect((await call("delete_bundle", { slug: "mcp-main", confirm: "mcp-main" })).error).toBe(
      "missing_scope",
    );
    const current = await call("get_download_link", { slug: "mcp-main" });
    process.env.HOSTI_MCP_DELETE_CLIENT_IDS = clientId;
    try {
      expect((await call("delete_bundle", { slug: "mcp-main", confirm: "wrong" })).error).toBe(
        "confirmation_required",
      );
      expect((await call("delete_bundle", { slug: "mcp-main", confirm: "mcp-main" })).deleted).toBe(
        true,
      );
      await publish("mcp-main");
      expect((await pull(current.url)).status).toBe(404);
      const reused = await call("get_download_link", { slug: "mcp-main", revision: 1 });
      expect((await call("delete_bundle", { slug: "mcp-main", confirm: "mcp-main" })).deleted).toBe(
        true,
      );
      await publish("mcp-main", "multi-page");
      expect((await pull(reused.url)).status).toBe(404);
    } finally {
      process.env.HOSTI_MCP_DELETE_CLIENT_IDS = "";
    }
  });
});
