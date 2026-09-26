import { Identity } from "@hosti/identity";
import { Effect } from "effect";

export const denyAgentConnection = Effect.fn("denyAgentConnection")(function* (id: string) {
  const identity = yield* Identity;
  return yield* identity.denyAgentConnection(id);
});
