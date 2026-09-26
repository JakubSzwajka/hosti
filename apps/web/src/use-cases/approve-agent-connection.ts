import { Identity } from "@hosti/identity";
import type { PushScope } from "@hosti/shared";
import { Effect } from "effect";

export const approveAgentConnection = Effect.fn("approveAgentConnection")(function* (
  id: string,
  grant: readonly PushScope[],
) {
  const identity = yield* Identity;
  return yield* identity.approveAgentConnection(id, grant);
});
