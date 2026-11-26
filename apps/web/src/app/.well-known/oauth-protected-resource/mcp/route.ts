import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const resource = process.env.HOSTI_MCP_URL;
  const issuer = process.env.CLERK_ISSUER;
  if (!resource || !issuer) return NextResponse.json({ error: "not_configured" }, { status: 404 });
  return NextResponse.json(
    {
      resource,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: ["email"],
      resource_name: "Hosti",
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } },
  );
}
