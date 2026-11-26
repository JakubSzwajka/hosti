import { Transfers } from "@hosti/storage";
import { Effect } from "effect";

export const reserveMcpUpload = Effect.fn("reserveMcpUpload")(function* (
  dataDir: string,
  id: string,
) {
  const transfers = yield* Transfers;
  return yield* transfers.reserveUpload(dataDir, id);
});
