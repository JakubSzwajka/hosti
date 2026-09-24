import { Identity } from "@hosti/identity";
import { Effect } from "effect";

export const mintToken = Effect.fn("mintToken")(function* (name: unknown) {
  const identity = yield* Identity;
  const input = yield* identity.readTokenName(name);
  const minted = yield* identity.createPushToken(input);
  const shown = yield* identity.holdMintedSecret(minted.secret);
  return { id: minted.id, shown };
});
