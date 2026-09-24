import { Identity } from "@hosti/identity";
import { Effect } from "effect";

export const showLoginSetup = Effect.fn("showLoginSetup")(function* () {
  const identity = yield* Identity;
  return yield* identity.missingAdminVars;
});
