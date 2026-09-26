import type { PushIdentity } from "@hosti/identity";
import type { PushScope } from "@hosti/shared";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { missingScope, unauthorized } from "@/server/api-responses";
import { authorizePush } from "@/use-cases/authorize-push";

export type PushAccess = { ok: true; identity: PushIdentity } | { ok: false; response: Response };

export async function requirePushScope(request: Request, scope: PushScope): Promise<PushAccess> {
  const verdict = await runAppUseCase(authorizePush(request.headers.get("authorization"), scope));
  if (verdict.status === "unauthorized") return { ok: false, response: unauthorized() };
  if (verdict.status === "missing_scope") return { ok: false, response: missingScope(scope) };
  return { ok: true, identity: verdict.identity };
}
