import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { create } from "tar";
import { bundlesDir, dataDir } from "@/server/config";

export async function mcpArchiveResponse(
  slug: string,
  seq: number,
  identity: string,
): Promise<Response | null> {
  const bundleRoot = path.join(bundlesDir(), slug);
  const root = path.join(bundleRoot, `r${seq}`);
  const directory = await fs.open(root, "r").catch(() => null);
  if (!directory) return null;
  try {
    const opened = await directory.stat();
    const current = await fs.stat(root);
    const storedIdentity = await fs.readFile(
      path.join(dataDir(), "mcp-transfers", "revisions", slug, `r${seq}`),
      "utf8",
    );
    if (
      !opened.isDirectory() ||
      current.ino !== opened.ino ||
      current.dev !== opened.dev ||
      storedIdentity !== identity
    ) {
      await directory.close();
      return null;
    }
    const cwd = `/proc/self/fd/${directory.fd}`;
    const names = await fs.readdir(cwd);
    const stream = Readable.from(create({ cwd, gzip: true, portable: true }, names));
    const close = () => {
      void directory.close().catch(() => undefined);
    };
    stream.once("close", close);
    stream.once("error", close);
    stream.once("end", close);
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${slug}-r${seq}.tar.gz"`,
        "X-Hosti-Revision": String(seq),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    await directory.close();
    return null;
  }
}
