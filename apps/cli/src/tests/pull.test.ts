import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { create } from "tar";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeStub } from "./stub-server.ts";

const stub = makeStub();
let root = "";
let archive: Buffer;
let collidingNameArchive: Buffer;

function maliciousArchive(name: string, type: string): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write("00000000000\0", 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, "ascii");
  if (type === "1" || type === "2") header.write("target", 157, 100, "utf8");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return gzipSync(Buffer.concat([header, Buffer.alloc(1024)]));
}

beforeAll(async () => {
  await stub.start();
  root = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-pull-test-"));
  await fs.mkdir(path.join(root, "source", "assets"), { recursive: true });
  await fs.writeFile(path.join(root, "source", "index.html"), "<h1>pulled</h1>");
  await fs.writeFile(path.join(root, "source", "assets", "data.bin"), Buffer.from([0, 1, 2, 255]));
  const chunks: Buffer[] = [];
  for await (const chunk of create({ gzip: true, cwd: path.join(root, "source") }, [
    "index.html",
    "assets/data.bin",
  ])) {
    chunks.push(Buffer.from(chunk));
  }
  archive = Buffer.concat(chunks);
  await fs.writeFile(
    path.join(root, "source", ".hosti-archive.tar.gz"),
    Buffer.from("stored archive name"),
  );
  const namedChunks: Buffer[] = [];
  for await (const chunk of create({ gzip: true, cwd: path.join(root, "source") }, [
    ".hosti-archive.tar.gz",
  ])) {
    namedChunks.push(Buffer.from(chunk));
  }
  collidingNameArchive = Buffer.concat(namedChunks);
});

afterAll(async () => {
  await stub.stop();
  await fs.rm(root, { recursive: true, force: true });
});

describe("hosti pull", () => {
  it("accepts every slug shape allowed by the server", async () => {
    stub.setCatalog([{ slug: "a--b", mode: "private" }]);
    stub.setArchive(archive, 7);
    const output = path.join(root, "double-dash");
    const result = await stub.hosti(["pull", "a--b", "--out", output]);
    expect(result.code).toBe(0);
    expect(stub.seen().at(-1)?.url).toBe("/api/v1/bundles/a--b/revisions/current/archive");
  });

  it("downloads current and prints the revision summary with output path last", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    stub.setArchive(archive, 7);
    const output = path.join(root, "current");
    const result = await stub.hosti(["pull", "atlas", "--out", output]);
    expect(result.code).toBe(0);
    expect(stub.seen().at(-1)).toMatchObject({
      method: "GET",
      url: "/api/v1/bundles/atlas/revisions/current/archive",
      authorization: "Bearer hosti_test",
    });
    expect(result.stdout).toContain("revision 7");
    expect(result.stdout).toContain("files    2");
    expect(result.stdout).toContain("bytes    19");
    expect(result.stdout.trim().split("\n").at(-1)).toBe(output);
    expect(await fs.readFile(path.join(output, "assets", "data.bin"))).toEqual(
      Buffer.from([0, 1, 2, 255]),
    );
  });

  it("restores a stored file named like the private archive input", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    stub.setArchive(collidingNameArchive, 8);
    const output = path.join(root, "archive-name");
    const result = await stub.hosti(["pull", "atlas", "--out", output]);
    expect(result.code).toBe(0);
    expect(await fs.readFile(path.join(output, ".hosti-archive.tar.gz"), "utf8")).toBe(
      "stored archive name",
    );
  });

  it("uses an explicit revision and refuses a nonempty destination unless forced", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    stub.setArchive(archive, 2);
    const output = path.join(root, "explicit");
    await fs.mkdir(output);
    await fs.writeFile(path.join(output, "stale.txt"), "keep me");
    const refused = await stub.hosti(["pull", "atlas", "--revision", "2", "--out", output]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("pass --force");
    expect(await fs.readFile(path.join(output, "stale.txt"), "utf8")).toBe("keep me");

    const replaced = await stub.hosti([
      "pull",
      "atlas",
      "--revision",
      "2",
      "--out",
      output,
      "--force",
    ]);
    expect(replaced.code).toBe(0);
    expect(stub.seen().at(-1)?.url).toBe("/api/v1/bundles/atlas/revisions/2/archive");
    expect(
      await fs.access(path.join(output, "stale.txt")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(await fs.readFile(path.join(output, "index.html"), "utf8")).toBe("<h1>pulled</h1>");
  });

  it("rejects an archive revision header that differs from the explicit selection", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    stub.setArchive(archive, 3);
    const result = await stub.hosti([
      "pull",
      "atlas",
      "--revision",
      "2",
      "--out",
      path.join(root, "mismatch"),
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("invalid revision header");
  });

  it("rejects an unsafe revision header", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    stub.setArchive(archive, Number.MAX_SAFE_INTEGER + 1);
    const result = await stub.hosti(["pull", "atlas", "--out", path.join(root, "unsafe-header")]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("invalid revision header");
  });

  it("preserves the destination when the archive is invalid", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    stub.setArchive(Buffer.from("not a gzip archive"), 3);
    const output = path.join(root, "preserved");
    await fs.mkdir(output);
    await fs.writeFile(path.join(output, "keep.txt"), "unchanged");
    const result = await stub.hosti(["pull", "atlas", "--out", output, "--force"]);
    expect(result.code).toBe(1);
    expect(await fs.readFile(path.join(output, "keep.txt"), "utf8")).toBe("unchanged");
  });

  it("allows an output path through a symlinked ancestor", async () => {
    const actual = path.join(root, "physical-parent");
    const linked = path.join(root, "linked-parent");
    await fs.mkdir(actual);
    await fs.symlink(actual, linked, "dir");
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    stub.setArchive(archive, 9);
    const output = path.join(linked, "bundle");
    const result = await stub.hosti(["pull", "atlas", "--out", output]);
    expect(result.code).toBe(0);
    expect(await fs.readFile(path.join(actual, "bundle", "index.html"), "utf8")).toBe(
      "<h1>pulled</h1>",
    );
  });

  it("refuses a home reached through a symlinked parent without replacing its contents", async () => {
    const realParent = path.join(root, "real-home-parent");
    const aliasParent = path.join(root, "alias-home-parent");
    const home = path.join(realParent, "home");
    await fs.mkdir(home, { recursive: true });
    await fs.symlink(realParent, aliasParent, "dir");
    const marker = path.join(home, "keep.txt");
    await fs.writeFile(marker, "unchanged");
    const result = await stub.hosti(
      ["pull", "atlas", "--out", path.join(aliasParent, "home"), "--force"],
      {
        HOME: path.join(aliasParent, "home"),
        XDG_CONFIG_HOME: path.join(root, "synthetic-xdg-home-parent"),
      },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Refusing dangerous output path");
    expect(await fs.readFile(marker, "utf8")).toBe("unchanged");
  });

  it("refuses an ancestor of a home reached through a symlinked parent", async () => {
    const realParent = path.join(root, "ancestor-real-home-parent");
    const aliasParent = path.join(root, "ancestor-alias-home-parent");
    const home = path.join(realParent, "home");
    await fs.mkdir(home, { recursive: true });
    await fs.symlink(realParent, aliasParent, "dir");
    const marker = path.join(home, "keep.txt");
    await fs.writeFile(marker, "unchanged");
    const result = await stub.hosti(["pull", "atlas", "--out", realParent, "--force"], {
      HOME: path.join(aliasParent, "home"),
      XDG_CONFIG_HOME: path.join(root, "synthetic-xdg-ancestor-home"),
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Refusing dangerous output path");
    expect(await fs.readFile(marker, "utf8")).toBe("unchanged");
  });

  it("refuses a real home path when HOME is a final symlink", async () => {
    const home = path.join(root, "real-home");
    const homeAlias = path.join(root, "home-alias");
    await fs.mkdir(home);
    await fs.symlink(home, homeAlias, "dir");
    const marker = path.join(home, "keep.txt");
    await fs.writeFile(marker, "unchanged");
    const result = await stub.hosti(["pull", "atlas", "--out", home, "--force"], {
      HOME: homeAlias,
      XDG_CONFIG_HOME: path.join(root, "synthetic-xdg-home-alias"),
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Refusing dangerous output path");
    expect(await fs.readFile(marker, "utf8")).toBe("unchanged");
  });

  it("refuses a symlink destination", async () => {
    const actual = path.join(root, "actual-directory");
    const link = path.join(root, "linked-directory");
    await fs.mkdir(actual);
    await fs.symlink(actual, link, "dir");
    const result = await stub.hosti(["pull", "atlas", "--out", link]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("symlink");
    expect(await fs.readdir(actual)).toEqual([]);
  });

  it("preserves an existing destination when the archive request fails", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    stub.setArchive(null);
    const output = path.join(root, "download-failed");
    await fs.mkdir(output);
    await fs.writeFile(path.join(output, "keep.txt"), "unchanged");
    const result = await stub.hosti(["pull", "atlas", "--out", output, "--force"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Revision not found");
    expect(await fs.readFile(path.join(output, "keep.txt"), "utf8")).toBe("unchanged");
  });

  it.each([
    ["../escape.txt", "0"],
    ["absolute-escape", "0"],
    ["symbolic-link", "2"],
    ["hard-link", "1"],
    ["device", "3"],
  ])("rejects unsafe archive entry %s", async (name, type) => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    const archiveName = name === "absolute-escape" ? path.join(root, name) : name;
    stub.setArchive(maliciousArchive(archiveName, type), 3);
    const output = path.join(root, `unsafe-${Buffer.from(name).toString("hex")}-${type}`);
    await fs.mkdir(output);
    await fs.writeFile(path.join(output, "keep.txt"), "unchanged");
    const result = await stub.hosti(["pull", "atlas", "--out", output, "--force"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unsafe archive");
    expect(await fs.readFile(path.join(output, "keep.txt"), "utf8")).toBe("unchanged");
    expect(
      await fs.access(path.join(root, "escape.txt")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  });
});
