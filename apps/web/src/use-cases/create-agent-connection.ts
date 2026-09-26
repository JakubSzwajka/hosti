import { Identity, type AgentConnectionRequest } from "@hosti/identity";
import { Effect } from "effect";

export const createAgentConnection = Effect.fn("createAgentConnection")(function* (
  request: AgentConnectionRequest,
) {
  const identity = yield* Identity;
  return yield* identity.createAgentConnection(request);
});
