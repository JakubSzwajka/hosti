import { createHmac, timingSafeEqual } from "node:crypto";
import { McpAuthError } from "./mcp-auth";
import { failureResponse } from "@/server/api-responses";
import { PushError } from "@/server/errors";

export function mcpResource(): URL {
  const resource = process.env.HOSTI_MCP_URL;
  if (
    !resource ||
    !process.env.CLERK_ISSUER ||
    !process.env.HOSTI_OWNER_CLERK_USER_ID ||
    !process.env.HOSTI_SECRET
  )
    throw new McpAuthError(401);
  return new URL(resource);
}

function signature(kind: "upload" | "download", id: string): string {
  mcpResource();
  const key = process.env.HOSTI_SECRET ?? "";
  const method = kind === "upload" ? "PUT" : "GET";
  return createHmac("sha256", key).update(`hosti:mcp:${kind}:${method}:${id}`).digest("base64url");
}

export function transferUrl(kind: "upload" | "download", id: string): string {
  const url = new URL(`/api/mcp/${kind}s/${id}`, mcpResource());
  url.searchParams.set("sig", signature(kind, id));
  return url.href;
}

export function verifyTransferRequest(
  request: Request,
  kind: "upload" | "download",
  id: string,
): boolean {
  const expectedMethod = kind === "upload" ? "PUT" : "GET";
  if (request.method !== expectedMethod || !/^[a-f0-9-]{36}$/.test(id)) return false;
  const origin = request.headers.get("origin");
  if (origin && origin !== mcpResource().origin) return false;
  const provided = new URL(request.url).searchParams.get("sig") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(provided)) return false;
  const expected = signature(kind, id);
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function transferFailure(error: unknown): Response {
  const response = failureResponse(
    error instanceof PushError ? error : new PushError("not_found", "Transfer unavailable", 404),
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function admittedTransfer(subject: string): boolean {
  mcpResource();
  return subject === process.env.HOSTI_OWNER_CLERK_USER_ID;
}
