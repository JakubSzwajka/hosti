import { Identity } from "@hosti/identity";
import { Effect } from "effect";

export const showAgentConnection = Effect.fn("showAgentConnection")(function* (id: string) {
  const identity = yield* Identity;
  return yield* identity.showAgentConnection(id);
});
