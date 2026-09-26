import { Identity } from "@hosti/identity";
import { Effect } from "effect";

export const pollAgentConnection = Effect.fn("pollAgentConnection")(function* (
  id: string,
  authorization: string | null,
) {
  const identity = yield* Identity;
  if (!authorization?.startsWith("Bearer ")) return null;
  const pollingSecret = authorization.slice("Bearer ".length).trim();
  return yield* identity.pollAgentConnection(id, pollingSecret);
});
