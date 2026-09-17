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

/**
 * Where a page or a mutation route asks "is this the owner?". Everything under
 * `/`, `/c/` and `/b/` goes through here. Nothing under `/v/` ever does, and
 * `/api/v1/` stays on push tokens alone.
 */

export type Admin = { session: AdminSession; mutationToken: string };

/** The signed-in owner, or null. Never throws, never redirects. */
export async function currentAdmin(): Promise<Admin | null> {
  const secrets = adminSecrets();
  if (!secrets) return null;
  const store = await cookies();
  const session = verifySession(secrets.secret, store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return { session, mutationToken: mutationToken(secrets.secret, session) };
}

/**
 * The owner, or a redirect to the login form. An unconfigured install lands on
 * the same page, which says which variable is missing instead of letting anyone
 * in.
 */
export async function requireAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  return admin;
}

export type MutationRefusal = { ok: false; response: Response };
export type MutationAllowed = { ok: true; session: AdminSession };

/**
 * The half of the gate that reads only headers.
 *
 * A route whose body is expensive to parse calls this first, so an anonymous
 * caller is turned away before the server buffers anything they sent. The
 * mutation token still has to be checked afterwards, because this alone does
 * not prove the request came from a page Hosti rendered.
 */
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

/**
 * The gate every POST from the catalog passes. It wants a live session cookie
 * and the matching mutation token in the form body, because a script inside a
 * bundle shares this origin and the cookie rides along on its own.
 */
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

/**
 * Send the browser back to a catalog page after a mutation. The location stays
 * relative on purpose: Next rewrites `request.url` to its own idea of the host,
 * which would bounce a browser on 127.0.0.1 over to localhost.
 */
export function backTo(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}
