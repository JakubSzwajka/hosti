import { callerKey } from "@/app/_http/caller-key";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { isSecureRequest, sessionCookie } from "@/server/auth/cookie";
import { checkLoginAttempt } from "@/use-cases/check-login-attempt";
import { login } from "@/use-cases/login";
import { showLoginSetup } from "@/use-cases/show-login-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(error?: string): Response {
  const location = error ? `/login?error=${error}` : "/login";
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST(request: Request): Promise<Response> {
  const missing = await runAppUseCase(showLoginSetup());
  if (missing.length > 0) return back();

  const caller = callerKey(request.headers);
  const verdict = await runAppUseCase(checkLoginAttempt(caller));
  if (!verdict.allowed) return back("locked");

  const form = await request.formData();
  const result = await runAppUseCase(login(caller, form.get("password")));
  if (result.status === "unconfigured") return back();
  if (result.status !== "authenticated") return back(result.status);

  const response = new Response(null, { status: 303, headers: { Location: "/" } });
  response.headers.append(
    "Set-Cookie",
    sessionCookie(result.session, { secure: isSecureRequest(request) }),
  );
  return response;
}
