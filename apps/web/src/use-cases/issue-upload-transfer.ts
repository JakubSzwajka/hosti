import { issueTransfer, type UploadTransfer } from "@hosti/storage";
import { Effect } from "effect";

export const issueUploadTransfer = Effect.fn("issueUploadTransfer")(function* (
  dataDir: string,
  input: typeof UploadTransfer.Type,
) {
  return yield* issueTransfer(dataDir, input);
});
