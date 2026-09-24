import { Identity } from "@hosti/identity";
import { Serving } from "@hosti/serving";
import { Effect } from "effect";

export const createPreviewGrant = Effect.fn("createPreviewGrant")(function* (bundleSlug: string) {
  const identity = yield* Identity;
  const serving = yield* Serving;
  return yield* serving.previewGrant(bundleSlug, yield* identity.signingSecret);
});
