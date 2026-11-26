import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { create } from "tar";
import { directoryIdentity } from "@hosti/storage";
import { bundlesDir } from "@/server/config";
import { runStoragePromise } from "@/server/runtime";

export async function mcpArchiveResponse(
  slug: string,
  seq: number,
  identity: string,
): Promise<Response | null> {
  const root = await runStoragePromise((storage) => storage.revisionDir(bundlesDir(), slug, seq));
  const directory = await fs.open(root, "r").catch(() => null);
  if (!directory) return null;
  try {
    const opened = await directory.stat({ bigint: true });
    const current = await fs.stat(root, { bigint: true });
    if (
      !opened.isDirectory() ||
      current.ino !== opened.ino ||
      current.dev !== opened.dev ||
      directoryIdentity(opened) !== identity
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
