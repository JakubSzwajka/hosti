import { reserveUpload } from "@hosti/storage";
import { Effect } from "effect";

export const reserveMcpUpload = Effect.fn("reserveMcpUpload")(function* (
  dataDir: string,
  id: string,
) {
  return yield* reserveUpload(dataDir, id);
});
