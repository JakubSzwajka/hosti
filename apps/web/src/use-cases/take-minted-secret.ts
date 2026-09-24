import { Identity } from "@hosti/identity";
import { Effect } from "effect";

export const takeMintedSecret = Effect.fn("takeMintedSecret")(function* (
  id: string | null | undefined,
) {
  const identity = yield* Identity;
  return yield* identity.takeMintedSecret(id);
});
