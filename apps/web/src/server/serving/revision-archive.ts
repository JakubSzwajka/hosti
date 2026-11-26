import fs from "node:fs/promises";
import { create } from "tar";
import { Readable } from "node:stream";
import { bundlesDir } from "@/server/config";
import { runStoragePromise } from "@/server/runtime";

export async function revisionArchiveResponse(slug: string, seq: number): Promise<Response | null> {
  const root = await runStoragePromise((storage) => storage.revisionDir(bundlesDir(), slug, seq));
  const entry = await fs.lstat(root).catch(() => null);
  if (!entry?.isDirectory()) return null;
  const stream = Readable.from(create({ cwd: root, gzip: true, portable: true }, ["."]));
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${slug}-r${seq}.tar.gz"`,
      "X-Hosti-Revision": String(seq),
      "Cache-Control": "private, no-store",
    },
  });
}
