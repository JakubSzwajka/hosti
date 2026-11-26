import { handleMcp } from "@/app/_http/mcp-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = handleMcp;
export const GET = handleMcp;
export const DELETE = handleMcp;
export const PUT = handleMcp;
export const PATCH = handleMcp;
export const OPTIONS = handleMcp;
export const HEAD = handleMcp;
