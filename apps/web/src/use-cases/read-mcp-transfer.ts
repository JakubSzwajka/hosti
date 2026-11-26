import { Transfers } from "@hosti/storage";
import { Effect } from "effect";

export const readMcpTransfer = Effect.fn("readMcpTransfer")(function* (
  dataDir: string,
  id: string,
  kind: "upload" | "download",
) {
  const transfers = yield* Transfers;
  return yield* transfers.read(dataDir, id, kind);
});
