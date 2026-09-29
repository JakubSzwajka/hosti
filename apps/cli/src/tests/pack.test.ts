import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { gunzipSync } from "node:zlib";
import { Parser, type ReadEntry } from "tar";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectFiles, PackError, packBundle } from "../delivery/pack.ts";

const FIXTURES = path.resolve(import.meta.dirname, "../../../../fixtures");
let messy: string;

async function entriesOf(body: Buffer): Promise<string[]> {
  const names: string[] = [];
  const parser = new Parser();
  parser.on("entry", (entry: ReadEntry) => {
    names.push(entry.path);
    entry.resume();
  });
  await new Promise<void>((resolve, reject) => {
    parser.on("end", resolve);
    parser.on("error", reject);
    Readable.from(gunzipSync(body)).pipe(parser);
  });
  return names.map((name) => name.replace(/^\.\//, "")).sort();
}

beforeAll(async () => {
  messy = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-pack-"));
  await fs.mkdir(path.join(messy, "assets"), { recursive: true });
  await fs.mkdir(path.join(messy, ".git/objects"), { recursive: true });
  await fs.mkdir(path.join(messy, "node_modules/left-pad"), { recursive: true });
  await fs.writeFile(path.join(messy, "index.html"), "<h1>hi</h1>");
  await fs.writeFile(path.join(messy, "assets/chart.js"), "//");
  await fs.writeFile(path.join(messy, "assets/.DS_Store"), "junk");
  await fs.writeFile(path.join(messy, "._index.html"), "junk");
  await fs.writeFile(path.join(messy, ".DS_Store"), "junk");
  await fs.writeFile(path.join(messy, ".git/objects/abc"), "junk");
  await fs.writeFile(path.join(messy, "node_modules/left-pad/index.js"), "junk");
});

afterAll(async () => {
  await fs.rm(messy, { recursive: true, force: true });
});

describe("what goes in the tarball", () => {
  it("leaves out .git, node_modules, .DS_Store and ._ sidecars", async () => {
    expect(await collectFiles(messy)).toEqual(["assets/chart.js", "index.html"]);
  });

  it("packs only those files, and the tarball agrees", async () => {
    const bundle = await packBundle(messy);
    expect(await entriesOf(bundle.body)).toEqual(["assets/chart.js", "index.html"]);
  });

  it("keeps the tree of a real fixture", async () => {
    const bundle = await packBundle(path.join(FIXTURES, "multi-page"));
    expect(await entriesOf(bundle.body)).toEqual([
      "404.html",
      "assets/chart.js",
      "athletes/index.html",
      "index.html",
      "reports/2026-q3.html",
    ]);
  });

  it("packs a single HTML file under its own name", async () => {
    const bundle = await packBundle(path.join(FIXTURES, "single-file/sleep-note.html"));
    expect(bundle.files).toEqual(["sleep-note.html"]);
    expect(await entriesOf(bundle.body)).toEqual(["sleep-note.html"]);
  });
});

describe("what the packer refuses", () => {
  it("refuses a path that is not there", async () => {
    await expect(packBundle(path.join(messy, "nowhere"))).rejects.toThrow(PackError);
  });

  it("refuses a single file that is not HTML", async () => {
    await expect(packBundle(path.join(messy, "assets/chart.js"))).rejects.toThrow(/must be .html/);
  });

  it("refuses a directory with nothing in it", async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-empty-"));
    await expect(packBundle(empty)).rejects.toThrow(/holds no files/);
    await fs.rm(empty, { recursive: true, force: true });
  });
});
