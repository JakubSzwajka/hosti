import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeZip, useTempDataDir } from "./helpers";

/**
 * The zip reader on its own. It decides what zip means by an entry; the
 * limits and the path rules it enforces are RevisionSink's, shared with the
 * tar reader, so what is tested here is the reading and the cut-offs.
 */

const { slugFromFileName } = await import("@hosti/shared");
const { unpackZip } = await import("@/server/storage/unzip");

let dataDir: string;

beforeAll(async () => {
  dataDir = await useTempDataDir();
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("the zip reader's own limits", () => {
  it("cuts off a deflated file that inflates past the limit", async () => {
    const bomb = makeZip([
      { name: "index.html", content: "<h1>hi</h1>" },
      { name: "big.bin", content: "0".repeat(50_000), deflate: true, declaredSize: 10 },
    ]);
    const dir = path.join(dataDir, "scratch/bomb");
    await expect(
      unpackZip(Readable.from([bomb]), dir, { maxFileBytes: 1000 }),
    ).rejects.toMatchObject({ code: "file_too_large" });
  });

  it("stops a body larger than the compressed limit", async () => {
    const body = makeZip([{ name: "index.html", content: "x".repeat(4096) }]);
    await expect(
      unpackZip(Readable.from([body]), path.join(dataDir, "scratch/big"), {
        maxCompressedBytes: 8,
      }),
    ).rejects.toMatchObject({ code: "push_too_large", status: 413 });
  });

  it("drops the Finder's __MACOSX tree and its sidecars", async () => {
    const dir = path.join(dataDir, "scratch/mac");
    const stats = await unpackZip(
      Readable.from([
        makeZip([
          { name: "__MACOSX", directory: true },
          { name: "__MACOSX/._index.html", content: "junk" },
          { name: "index.html", content: "<h1>hi</h1>" },
        ]),
      ]),
      dir,
    );
    expect(stats.fileCount).toBe(1);
    expect(await fs.readdir(dir)).toEqual(["index.html"]);
  });

  it("says so when the bytes hold no zip directory", async () => {
    await expect(
      unpackZip(Readable.from([Buffer.alloc(200)]), path.join(dataDir, "scratch/junk")),
    ).rejects.toMatchObject({ code: "bad_zip" });
  });
});

describe("the slug a dropped file suggests", () => {
  it("strips the archive extension and cleans what is left", () => {
    expect(slugFromFileName("Garmin Q3.zip")).toBe("garmin-q3");
    expect(slugFromFileName("report.tar.gz")).toBe("report");
    expect(slugFromFileName("report.tgz")).toBe("report");
    expect(slugFromFileName("/tmp/Sleep_Notes (2026).zip")).toBe("sleep-notes-2026");
  });

  it("gives back nothing when the name holds nothing usable", () => {
    expect(slugFromFileName("___.zip")).toBe("");
    expect(slugFromFileName(".zip")).toBe("");
  });

  it("never suggests a slug the server would refuse", () => {
    const long = `${"a".repeat(80)}.zip`;
    expect(slugFromFileName(long)).toHaveLength(64);
    expect(slugFromFileName("--weird--.zip")).toBe("weird");
  });
});
