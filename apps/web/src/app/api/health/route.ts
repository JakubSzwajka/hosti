import { privateRoute } from "@/app/_http/private-channel";
import { jsonResponse } from "@/server/api-responses";
import { appCommit } from "./app-commit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = privateRoute(
  async (_request: Request): Promise<Response> =>
    jsonResponse({ status: "ok", commit: appCommit() }, 200, {
      "Cache-Control": "no-store",
    }),
);
