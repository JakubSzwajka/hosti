import { adminSecrets } from "@/server/auth/config";
import { isSecureRequest, sessionCookie } from "@/server/auth/cookie";
import { callerKey, loginLimiter } from "@/server/auth/rate-limit";
import { constantTimeEquals, signSession } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(error?: string): Response {
  const location = error ? `/login?error=${error}` : "/login";
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST(request: Request): Promise<Response> {
  const secrets = adminSecrets();
  if (!secrets) return back();

  const caller = callerKey(request.headers);
  const limiter = loginLimiter();
  if (!limiter.check(caller).allowed) return back("locked");

  const form = await request.formData();
  const supplied = form.get("password");
  if (typeof supplied !== "string" || !constantTimeEquals(secrets.password, supplied)) {
    const verdict = limiter.fail(caller);
    return back(verdict.allowed ? "bad" : "locked");
  }

  limiter.succeed(caller);
  const response = new Response(null, { status: 303, headers: { Location: "/" } });
  response.headers.append(
    "Set-Cookie",
    sessionCookie(signSession(secrets.secret), { secure: isSecureRequest(request) }),
  );
  return response;
}
