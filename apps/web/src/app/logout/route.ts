import { guardMutation } from "@/server/auth/admin";
import { expiredSessionCookie, isSecureRequest } from "@/server/auth/cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;

  const response = new Response(null, { status: 303, headers: { Location: "/login" } });
  response.headers.append("Set-Cookie", expiredSessionCookie({ secure: isSecureRequest(request) }));
  return response;
}
