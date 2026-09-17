import type { ErrorResponse } from "@hosti/shared";
import { PushError } from "@/server/errors";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: code, message } satisfies ErrorResponse, status);
}

export const unauthorized = (): Response =>
  errorResponse("unauthorized", "A valid push token is required", 401);

/** Turn a thrown push failure into the API's shape; anything else is a 500. */
export function failureResponse(error: unknown): Response {
  if (error instanceof PushError) {
    return errorResponse(error.code, error.message, error.status);
  }
  const message = error instanceof Error ? error.message : String(error);
  return errorResponse("internal_error", message, 500);
}
