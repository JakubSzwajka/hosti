import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { base, call, dataDir, initialize, publish, pull, token, upload } from "./mcp-fixture";
import { createBundle, createPushToken, db, recordRevision } from "./support";
import { makeTar, tarFixture } from "./test-fixtures";
import { POST as apiPush } from "@/app/api/v1/bundles/[slug]/revisions/route";

const publicOrigin = "https://public.hosti.test";

describe("MCP correction regressions", () => {
  it("keeps public result URLs separate from capability origins", async () => {
    const saved = process.env.HOSTI_PUBLIC_URL;
    process.env.HOSTI_PUBLIC_URL = `${publicOrigin}/`;
    try {
      const grant = await call("push", { slug: "origins" });
      expect(new URL(grant.url).origin).toBe(base);
      const result = await upload(grant.url, await tarFixture("single-file"));
      expect((await result.json()).adminUrl).toBe(`${publicOrigin}/b/origins`);
      const linked = await call("set_sharing", { slug: "origins", mode: "link" });
      expect(new URL(linked.shareUrl).origin).toBe(publicOrigin);
      const rotated = await call("rotate_link", { slug: "origins" });
      expect(new URL(rotated.shareUrl).origin).toBe(publicOrigin);
      const shown = await call("get_bundle", { slug: "origins" });
      expect(shown.adminUrl).toBe(`${publicOrigin}/b/origins`);
      expect(new URL(shown.shareUrl).origin).toBe(publicOrigin);
      const download = await call("get_download_link", { slug: "origins" });
      expect(new URL(download.url).origin).toBe(base);
    } finally {
      process.env.HOSTI_PUBLIC_URL = saved;
    }
  });

  it("denies an old grant after a pre-feature writer recreates the same catalog and directory paths", async () => {
    await publish("old-writer");
    const grant = await call("get_download_link", { slug: "old-writer" });
    const original = await pull(grant.url);
    expect(original.status).toBe(200);
    await original.arrayBuffer();
    const root = path.join(dataDir, "bundles", "old-writer");
    await fs.rename(root, `${root}-removed`);
    db().prepare("DELETE FROM bundles WHERE slug = ?").run("old-writer");
    await fs.mkdir(path.join(root, "r1"), { recursive: true });
    await fs.writeFile(path.join(root, "r1", "index.html"), "replacement-generation");
    await fs.symlink("r1", path.join(root, "current"));
    const bundle = createBundle({ slug: "old-writer" });
    recordRevision({ bundleId: bundle.id, seq: 1, byteSize: 22, fileCount: 1, pushedBy: "old" });
    expect((await pull(grant.url)).status).toBe(404);
    const replacement = await call("get_download_link", { slug: "old-writer" });
    const response = await pull(replacement.url);
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  });

  it("lets legacy pushes work with MCP disabled and its metadata path obstructed", async () => {
    const metadata = path.join(dataDir, "mcp-transfers");
    await fs.rm(metadata, { recursive: true, force: true });
    await fs.writeFile(metadata, "not a writable transfer directory");
    const saved = process.env.HOSTI_MCP_URL;
    delete process.env.HOSTI_MCP_URL;
    try {
      const credential = createPushToken("legacy");
      const response = await apiPush(
        new Request(`${base}/api/v1/bundles/legacy/revisions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${credential.secret}` },
          body: new Uint8Array(await tarFixture("single-file")),
        }),
        { params: Promise.resolve({ slug: "legacy" }) },
      );
      expect(response.status).toBe(201);
      expect((await response.json()).revision).toBe(1);
    } finally {
      process.env.HOSTI_MCP_URL = saved;
      await fs.rm(metadata, { force: true });
    }
  });

  it("enforces the grant byte limit on a body without Content-Length", async () => {
    const grant = await call("push", { slug: "grant-limit" });
    const id = new URL(grant.url).pathname.split("/").pop() ?? "";
    const file = path.join(dataDir, "mcp-transfers", `${id}.json`);
    const state = JSON.parse(await fs.readFile(file, "utf8"));
    state.input.maxBytes = 32;
    await fs.writeFile(file, JSON.stringify(state));
    const response = await upload(grant.url, makeTar([{ name: "index.html", content: "valid" }]));
    expect(response.status).toBe(413);
    expect((await call("get_bundle", { slug: "grant-limit" })).error).toBe("not_found");
  });

  it("caps normalized client names by codepoints without splitting a surrogate pair", async () => {
    const name = `${"a".repeat(79)}\u{1f680}tail`;
    const initialized = await initialize(token, name);
    const grant = await call("push", { slug: "unicode-name" }, initialized.id ?? "");
    expect((await upload(grant.url, await tarFixture("single-file"))).status).toBe(201);
    const shown = await call("get_bundle", { slug: "unicode-name" });
    expect(shown.revisions[0].pushedBy).toBe(`mcp:${"a".repeat(79)}\u{1f680}`);
  });
});
