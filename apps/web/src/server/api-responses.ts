import type { ErrorResponse, MissingScopeResponse, PushScope } from "@hosti/shared";
import { PushError } from "@/server/errors";

export function jsonResponse(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: code, message } satisfies ErrorResponse, status);
}

export const unauthorized = (): Response =>
  errorResponse("unauthorized", "A valid push token is required", 401);

export function missingScopeMessage(scope: PushScope): string {
  const login = scope === "delete" ? "hosti login --allow-delete" : "hosti login";
  return `This push token lacks the "${scope}" scope. The owner can grant it by approving a new connection with \`${login}\`.`;
}

export const missingScope = (scope: PushScope): Response =>
  jsonResponse(
    {
      error: "missing_scope",
      scope,
      message: missingScopeMessage(scope),
    } satisfies MissingScopeResponse,
    403,
  );

export const noSuchConnection = (): Response =>
  errorResponse("not_found", "No such agent connection", 404);

export function failureResponse(error: unknown): Response {
  if (error instanceof PushError) {
    return errorResponse(error.code, error.message, error.status);
  }
  const message = error instanceof Error ? error.message : String(error);
  return errorResponse("internal_error", message, 500);
}
