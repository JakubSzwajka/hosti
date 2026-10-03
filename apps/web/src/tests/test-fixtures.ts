import { randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateRawSync, gzipSync } from "node:zlib";
import { create } from "tar";

export const FIXTURES = path.resolve(import.meta.dirname, "../../../../fixtures");

export function ownerPasswordHash(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:16384:8:1:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

export async function useTempDataDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-test-"));
  process.env.HOSTI_DATA_DIR = dir;
  return dir;
}

export async function tarFixture(name: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const stream = create({ gzip: true, cwd: path.join(FIXTURES, name), portable: true }, ["."]);
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export type TarEntry = {
  name: string;
  content?: string;
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

export type ZipEntry = {
  name: string;
  content?: string;
  deflate?: boolean;
  symlink?: boolean;
  directory?: boolean;
  declaredSize?: number;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (CRC_TABLE[(value ^ byte) & 0xff] as number) ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function externalAttributes(entry: ZipEntry): number {
  if (entry.symlink) return (0o120777 << 16) >>> 0;
  if (entry.directory) return ((0o040755 << 16) >>> 0) | 0x10;
  return (0o100644 << 16) >>> 0;
}

export function makeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(
      entry.directory && !entry.name.endsWith("/") ? `${entry.name}/` : entry.name,
      "utf8",
    );
    const raw = Buffer.from(entry.content ?? "", "utf8");
    const method = entry.deflate ? 8 : 0;
    const packed = entry.deflate ? deflateRawSync(raw) : raw;
    const declared = entry.declaredSize ?? raw.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(declared, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(entry.symlink ? 0x0314 : 0x031e, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(0, 12);
    record.writeUInt32LE(crc32(raw), 16);
    record.writeUInt32LE(packed.length, 20);
    record.writeUInt32LE(declared, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt16LE(0, 30);
    record.writeUInt16LE(0, 32);
    record.writeUInt16LE(0, 34);
    record.writeUInt16LE(0, 36);
    record.writeUInt32LE(externalAttributes(entry), 38);
    record.writeUInt32LE(offset, 42);

    locals.push(local, name, packed);
    central.push(record, name);
    offset += local.length + name.length + packed.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export async function zipFixture(name: string): Promise<Buffer> {
  const root = path.join(FIXTURES, name);
  const entries: ZipEntry[] = [];
  const walk = async (prefix: string): Promise<void> => {
    for (const found of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${found.name}` : found.name;
      if (found.isDirectory()) {
        entries.push({ name: relative, directory: true });
        await walk(relative);
      } else if (found.isFile()) {
        entries.push({
          name: relative,
          content: await fs.readFile(path.join(root, relative), "utf8"),
          deflate: true,
        });
      }
    }
  };
  await walk("");
  return makeZip(entries);
}
