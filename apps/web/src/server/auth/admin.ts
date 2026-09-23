import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminSecrets } from "@/server/auth/config";
import { readCookie } from "@/server/auth/cookie";
import {
  type AdminSession,
  checkMutationToken,
  mutationToken,
  SESSION_COOKIE,
  verifySession,
} from "@/server/auth/session";

export type Admin = { session: AdminSession; mutationToken: string };

export async function currentAdmin(): Promise<Admin | null> {
  const secrets = adminSecrets();
  if (!secrets) return null;
  const store = await cookies();
  const session = verifySession(secrets.secret, store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return { session, mutationToken: mutationToken(secrets.secret, session) };
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
  const session = verifySession(secrets.secret, readCookie(request.headers, SESSION_COOKIE));
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
  if (typeof supplied !== "string" || !checkMutationToken(secrets.secret, session, supplied)) {
    return { ok: false, response: new Response("Stale form, reload the page", { status: 403 }) };
  }
  return { ok: true, session };
}

export function backTo(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}
