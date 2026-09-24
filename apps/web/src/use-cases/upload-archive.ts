import { storeRevision, type StoreRevisionInput } from "@hosti/bundles";
import { Effect } from "effect";

export const uploadArchive = Effect.fn("uploadArchive")(function* (input: StoreRevisionInput) {
  return yield* storeRevision(input);
});
