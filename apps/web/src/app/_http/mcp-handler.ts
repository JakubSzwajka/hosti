import { Layer, Schema } from "effect";
import { McpProtocol, McpServer } from "effect/unstable/ai";
import { HttpRouter } from "effect/unstable/http";
import { McpAuthError, verifyMcpBearer, type McpPrincipal } from "./mcp-auth";
import { mcpResource } from "./mcp-capability";
import { MCP_WRITE_TOOLS, mcpTools } from "./mcp-tools";
import { writerRoute } from "./writer-route";

type Session = {
  principal: McpPrincipal;
  expiresAt: number;
  transport: ReturnType<typeof makeTransport>;
};
const holder = globalThis as typeof globalThis & { __hostiMcpSessions?: Map<string, Session> };
holder.__hostiMcpSessions ??= new Map<string, Session>();
const sessions = holder.__hostiMcpSessions;
const Initialization = Schema.Struct({
  method: Schema.Literal("initialize"),
  params: Schema.Struct({ clientInfo: Schema.Struct({ name: Schema.String }) }),
});
const ToolCall = Schema.Struct({
  method: Schema.Literal("tools/call"),
  params: Schema.Struct({ name: Schema.String }),
});
const isToolCall = Schema.is(ToolCall);
const MAX_REQUEST_BYTES = 64 * 1024;
const SESSION_TTL = 30 * 60_000;
let initializing = 0;

function makeTransport(principal: McpPrincipal, name: string, requestOrigin: string) {
  const server = McpServer.layerHttp({
    name: "Hosti",
    version: "1.0.0",
    path: "/mcp",
    protocols: [McpProtocol.v2025_11_25, McpProtocol.v2025_06_18, McpProtocol.v2025_03_26],
    allowedOrigins: [mcpResource().origin],
  });
  return HttpRouter.toWebHandler(
    mcpTools(principal, name, requestOrigin).pipe(Layer.provideMerge(server)),
    {
      disableLogger: true,
    },
  );
}

function denied(status: number): Response {
  const resource = process.env.HOSTI_MCP_URL;
  const challenge = resource
    ? `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/mcp", resource).href}"`
    : "Bearer";
  return Response.json(
    { error: status === 401 ? "unauthorized" : "forbidden" },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 401 ? { "WWW-Authenticate": challenge } : {}),
      },
    },
  );
}

async function boundedBody(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 15_000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return timedOut ? null : Buffer.concat(chunks).toString("utf8");
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}

function callsWriteTool(body: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false;
  }
  const messages: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  return messages.some(
    (message) => isToolCall(message) && MCP_WRITE_TOOLS.has(message.params.name),
  );
}

function buffered(forward: () => Promise<Response>): () => Promise<Response> {
  return async () => {
    const response = await forward();
    const bytes = await response.arrayBuffer();
    return new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

async function dispatchMcp(request: Request): Promise<Response> {
  let principal: McpPrincipal;
  try {
    principal = await verifyMcpBearer(request);
    const origin = request.headers.get("origin");
    if (origin && origin !== mcpResource().origin) return denied(403);
    mcpResource();
  } catch (error) {
    return denied(error instanceof McpAuthError ? error.status : 401);
  }
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
      await session.transport.dispose();
    }
  }
  const id = request.headers.get("mcp-session-id");
  if (id) {
    const session = sessions.get(id);
    if (!session)
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    if (
      session.principal.subject !== principal.subject ||
      session.principal.clientId !== principal.clientId
    ) {
      return denied(403);
    }
    if (request.method === "DELETE") {
      sessions.delete(id);
      await session.transport.dispose();
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST, DELETE" } });
    const body = await boundedBody(request);
    if (body === null) return new Response(null, { status: 413 });
    const forward = () =>
      session.transport.handler(
        new Request(request.url, { method: "POST", headers: request.headers, body }),
      );
    const response = callsWriteTool(body)
      ? await writerRoute(buffered(forward))()
      : await forward();
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (sessions.size + initializing >= 128) return new Response(null, { status: 429 });
  initializing++;
  try {
    const body = await boundedBody(request);
    if (body === null) return new Response(null, { status: 413 });
    let name: string;
    try {
      const init = Schema.decodeUnknownSync(Schema.fromJsonString(Initialization))(body);
      const normalized = Array.from(init.params.clientInfo.name.normalize("NFKC"))
        .filter((char) => !/\p{C}/u.test(char))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      name = Array.from(normalized).slice(0, 80).join("") || "unknown";
    } catch {
      return Response.json({ error: "initialize_required" }, { status: 400 });
    }
    const transport = makeTransport(principal, name, new URL(request.url).origin);
    const response = await transport.handler(
      new Request(request.url, { method: "POST", headers: request.headers, body }),
    );
    const sessionId = response.headers.get("mcp-session-id");
    if (response.ok && sessionId) {
      sessions.set(sessionId, { principal, expiresAt: now + SESSION_TTL, transport });
    } else {
      await transport.dispose();
    }
    response.headers.set("Cache-Control", "no-store");
    return response;
  } finally {
    initializing--;
  }
}

export async function handleMcp(request: Request): Promise<Response> {
  try {
    const response = await dispatchMcp(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return Response.json(
      { error: "mcp_request_failed" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
