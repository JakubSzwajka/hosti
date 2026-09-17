import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { PushError } from "@/server/errors";
import { safeEntryPath } from "@/server/storage/unpack";
import { unpackTarball } from "@/server/storage/unpack";
import { makeTar } from "./helpers";

const scratch: string[] = [];

async function unpackDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-unpack-"));
  scratch.push(dir);
  return path.join(dir, "r1");
}

afterAll(async () => {
  for (const dir of scratch) await fs.rm(dir, { recursive: true, force: true });
});

describe("safeEntryPath", () => {
  it("keeps a normal path and drops the ./ prefix", () => {
    expect(safeEntryPath("./assets/chart.js")).toBe("assets/chart.js");
  });

  it("refuses climbing, absolute paths and NUL bytes", () => {
    expect(() => safeEntryPath("../escape.html")).toThrow(PushError);
    expect(() => safeEntryPath("a/../../escape.html")).toThrow(PushError);
    expect(() => safeEntryPath("/etc/passwd")).toThrow(PushError);
    expect(() => safeEntryPath("bad\0name")).toThrow(PushError);
  });
});

describe("push limits", () => {
  it("stops a body larger than the compressed limit", async () => {
    const body = makeTar([{ name: "index.html", content: "x".repeat(4096) }]);
    await expect(
      unpackTarball(Readable.from(body), await unpackDir(), { maxCompressedBytes: 8 }),
    ).rejects.toMatchObject({ code: "push_too_large", status: 413 });
  });

  it("stops a tarball with too many files", async () => {
    const body = makeTar([
      { name: "index.html", content: "<h1>hi</h1>" },
      { name: "a.txt", content: "a" },
      { name: "b.txt", content: "b" },
    ]);
    await expect(
      unpackTarball(Readable.from(body), await unpackDir(), { maxFiles: 2 }),
    ).rejects.toMatchObject({ code: "too_many_files" });
  });

  it("drops macOS AppleDouble sidecars", async () => {
    const dir = await unpackDir();
    const stats = await unpackTarball(
      Readable.from(
        makeTar([
          { name: "./._note.html", content: "junk" },
          { name: "./note.html", content: "<h1>hi</h1>" },
        ]),
      ),
      dir,
    );
    expect(stats.fileCount).toBe(1);
    expect(await fs.readdir(dir)).toEqual(["note.html"]);
  });

  it("accepts a tarball inside the limits", async () => {
    const dir = await unpackDir();
    const stats = await unpackTarball(
      Readable.from(makeTar([{ name: "index.html", content: "<h1>hi</h1>" }])),
      dir,
    );
    expect(stats).toEqual({ fileCount: 1, byteSize: 11 });
    expect(await fs.readFile(path.join(dir, "index.html"), "utf8")).toBe("<h1>hi</h1>");
  });
});
