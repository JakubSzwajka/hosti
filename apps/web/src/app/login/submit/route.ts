import { callerKey } from "@/app/_http/caller-key";
import { safeReturnPath } from "@/app/_http/return-path";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { isSecureRequest, sessionCookie } from "@/server/auth/cookie";
import { checkLoginAttempt } from "@/use-cases/check-login-attempt";
import { login } from "@/use-cases/login";
import { showLoginSetup } from "@/use-cases/show-login-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(error?: string, returnTo?: string | null): Response {
  const query = new URLSearchParams();
  if (error) query.set("error", error);
  if (returnTo) query.set("next", returnTo);
  const search = query.toString();
  const location = search ? `/login?${search}` : "/login";
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST(request: Request): Promise<Response> {
  const missing = await runAppUseCase(showLoginSetup());
  if (missing.length > 0) return back();

  const form = await request.formData();
  const returnTo = safeReturnPath(form.get("next"));

  const caller = callerKey(request.headers);
  const verdict = await runAppUseCase(checkLoginAttempt(caller));
  if (!verdict.allowed) return back("locked", returnTo);

  const result = await runAppUseCase(login(caller, form.get("password")));
  if (result.status === "unconfigured") return back();
  if (result.status !== "authenticated") return back(result.status, returnTo);

  const response = new Response(null, { status: 303, headers: { Location: returnTo ?? "/" } });
  response.headers.append(
    "Set-Cookie",
    sessionCookie(result.session, { secure: isSecureRequest(request) }),
  );
  return response;
}
