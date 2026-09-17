import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { create } from "tar";

export const FIXTURES = path.resolve(import.meta.dirname, "../../../fixtures");

/** Point Hosti at a throwaway data directory for one test file. */
export async function useTempDataDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-test-"));
  process.env.HOSTI_DATA_DIR = dir;
  return dir;
}

/** Pack a fixture directory the way the CLI will: gzipped tar, paths relative. */
export async function tarFixture(name: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const stream = create({ gzip: true, cwd: path.join(FIXTURES, name), portable: true }, ["."]);
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export type TarEntry = {
  name: string;
  content?: string;
  /** Declared size, when it should lie about the content that follows. */
  declaredSize?: number;
  type?: "file" | "symlink" | "directory" | "character-device";
  linkname?: string;
};

const TYPE_FLAGS: Record<NonNullable<TarEntry["type"]>, string> = {
  file: "0",
  symlink: "2",
  directory: "5",
  "character-device": "3",
};

/** Build a gzipped tar by hand, so a test can post paths node-tar would refuse to write. */
export function makeTar(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.content ?? "", "utf8");
    const size = entry.declaredSize ?? body.length;
    blocks.push(tarHeader(entry, size));
    if (body.length > 0) {
      const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512);
      body.copy(padded);
      blocks.push(padded);
    }
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

function tarHeader(entry: TarEntry, size: number): Buffer {
  const header = Buffer.alloc(512);
  header.write(entry.name, 0, 100, "utf8");
  writeOctal(header, 0o644, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, entry.type === "symlink" ? 0 : size, 124, 12);
  writeOctal(header, Math.floor(Date.now() / 1000), 136, 12);
  header.write("        ", 148, 8, "utf8");
  header.write(TYPE_FLAGS[entry.type ?? "file"], 156, 1, "utf8");
  if (entry.linkname) header.write(entry.linkname, 157, 100, "utf8");
  header.write("ustar\0", 257, 6, "binary");
  header.write("00", 263, 2, "utf8");

  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "utf8");
  return header;
}

function writeOctal(buffer: Buffer, value: number, offset: number, length: number): void {
  buffer.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length, "utf8");
}
