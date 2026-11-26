import { readTransfer } from "@hosti/storage";
import { Effect } from "effect";

export const readMcpTransfer = Effect.fn("readMcpTransfer")(function* (
  dataDir: string,
  id: string,
  kind: "upload" | "download",
) {
  return yield* readTransfer(dataDir, id, kind);
});
