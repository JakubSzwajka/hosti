import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AdminSession } from "@hosti/identity";
import { adminSecrets } from "@/server/auth/config";
import { readCookie, SESSION_COOKIE } from "@/server/auth/cookie";
import { runIdentitySync } from "@/server/runtime";

export type Admin = { session: AdminSession; mutationToken: string };

export async function currentAdmin(): Promise<Admin | null> {
  const secrets = adminSecrets();
  if (!secrets) return null;
  const store = await cookies();
  const session = runIdentitySync((identity) =>
    identity.verifySession(secrets.secret, store.get(SESSION_COOKIE)?.value),
  );
  if (!session) return null;
  const mutationToken = runIdentitySync((identity) =>
    identity.mutationToken(secrets.secret, session),
  );
  return { session, mutationToken };
}

export async function requireAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  return admin;
}

export type MutationRefusal = { ok: false; response: Response };
export type MutationAllowed = { ok: true; session: AdminSession };

export function guardSession(request: Request): MutationRefusal | MutationAllowed {
  const secrets = adminSecrets();
  if (!secrets) {
    return { ok: false, response: new Response("Hosti is not configured", { status: 503 }) };
  }
  const session = runIdentitySync((identity) =>
    identity.verifySession(secrets.secret, readCookie(request.headers, SESSION_COOKIE)),
  );
  if (!session) {
    return { ok: false, response: new Response("Sign in first", { status: 401 }) };
  }
  return { ok: true, session };
}

export function guardMutation(request: Request, form: FormData): MutationRefusal | MutationAllowed {
  const gate = guardSession(request);
  if (!gate.ok) return gate;
  const secrets = adminSecrets();
  if (!secrets) {
    return { ok: false, response: new Response("Hosti is not configured", { status: 503 }) };
  }
  const session = gate.session;
  const supplied = form.get("token");
  const valid =
    typeof supplied === "string" &&
    runIdentitySync((identity) => identity.checkMutationToken(secrets.secret, session, supplied));
  if (!valid) {
    return { ok: false, response: new Response("Stale form, reload the page", { status: 403 }) };
  }
  return { ok: true, session };
}

export function backTo(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}
