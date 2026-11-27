import { describe, expect, it } from "vitest";
import { base, call, publish, rpc } from "./mcp-fixture";
import { privateRequest } from "./support";
import { POST as fenceOn } from "@/app/internal/deploy/fence/on/route";
import { POST as fenceOff } from "@/app/internal/deploy/fence/off/route";

function fence(kind: "on" | "off", epoch: string): Request {
  return privateRequest(`${base}/internal/deploy/fence/${kind}`, {
    method: "POST",
    headers: { "X-Small-App-Epoch": epoch },
    body: JSON.stringify({ epoch }),
  });
}

describe("MCP while writes are fenced", () => {
  it("answers write tools with HTTP 503 and keeps read tools", async () => {
    await publish("fenced-mcp");
    expect((await fenceOn(fence("on", "mcp-epoch"))).status).toBe(200);

    for (const [name, args] of [
      ["push", { slug: "fenced-new" }],
      ["get_download_link", { slug: "fenced-mcp" }],
      ["set_sharing", { slug: "fenced-mcp", mode: "link" }],
      ["rotate_link", { slug: "fenced-mcp" }],
      ["prune", { slug: "fenced-mcp" }],
      ["delete_bundle", { slug: "fenced-mcp", confirm: "fenced-mcp" }],
    ] as const) {
      const response = await rpc("tools/call", { name, arguments: args });
      expect([name, response.status, response.headers.get("retry-after")]).toEqual([
        name,
        503,
        "5",
      ]);
    }
    const listed = await call("list_bundles");
    expect(listed.bundles.map((bundle: { slug: string }) => bundle.slug)).toEqual(["fenced-mcp"]);
    expect((await call("get_bundle", { slug: "fenced-mcp" })).bundle.slug).toBe("fenced-mcp");

    expect((await fenceOff(fence("off", "mcp-epoch"))).status).toBe(200);
    expect((await call("get_download_link", { slug: "fenced-mcp" })).method).toBe("GET");
  });
});
