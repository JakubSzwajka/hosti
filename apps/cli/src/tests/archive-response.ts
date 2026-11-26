import type { ServerResponse } from "node:http";

export async function sendArchiveResponse(
  response: ServerResponse,
  slug: string,
  catalog: { slug: string }[],
  archive: Buffer | null,
  revision: number,
  missing: (slug: string) => void,
): Promise<boolean> {
  if (!catalog.some((entry) => entry.slug === slug)) {
    missing(slug);
  } else if (!archive) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found", message: "Revision not found" }));
  } else {
    response.writeHead(200, {
      "content-type": "application/gzip",
      "x-hosti-revision": String(revision),
      "content-disposition": `attachment; filename="${slug}-r${revision}.tar.gz"`,
    });
    response.end(archive);
  }
  return true;
}
