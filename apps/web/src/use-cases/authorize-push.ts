import type { PushIdentity } from "@hosti/identity";
import type { PushScope } from "@hosti/shared";
import { Effect } from "effect";
import { authenticatePush } from "./authenticate-push";

export type PushAuthorization =
  | { status: "unauthorized" }
  | { status: "missing_scope"; scope: PushScope }
  | { status: "allowed"; identity: PushIdentity };

export const authorizePush = Effect.fn("authorizePush")(function* (
  authorization: string | null,
  scope: PushScope,
) {
  const identity = yield* authenticatePush(authorization);
  if (!identity) return { status: "unauthorized" } satisfies PushAuthorization;
  if (!identity.scopes.includes(scope)) {
    return { status: "missing_scope", scope } satisfies PushAuthorization;
  }
  return { status: "allowed", identity } satisfies PushAuthorization;
});
