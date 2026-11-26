import { Transfers, type UploadTransfer } from "@hosti/storage";
import { Effect } from "effect";

export const issueUploadTransfer = Effect.fn("issueUploadTransfer")(function* (
  dataDir: string,
  input: typeof UploadTransfer.Type,
) {
  const transfers = yield* Transfers;
  return yield* transfers.issue(dataDir, input);
});
