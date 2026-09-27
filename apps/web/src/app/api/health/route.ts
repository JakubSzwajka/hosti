import { jsonResponse } from "@/server/api-responses";
import { appCommit } from "./app-commit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return jsonResponse({ status: "ok", commit: appCommit() }, 200, {
    "Cache-Control": "no-store",
  });
}
