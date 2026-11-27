import { WriterEpoch } from "@hosti/catalog";
import { Schema } from "effect";

export const EPOCH_HEADER = "x-small-app-epoch";
const MAX_BODY_BYTES = 1024;
const FenceBody = Schema.Struct({ epoch: WriterEpoch });
const decodeFenceBody = Schema.decodeUnknownOption(Schema.fromJsonString(FenceBody), {
  onExcessProperty: "error",
});

export async function readFenceEpoch(request: Request): Promise<string | null> {
  const header = request.headers.get(EPOCH_HEADER);
  if (header === null) return null;
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return null;
  const body = decodeFenceBody(text);
  if (body._tag === "None" || body.value.epoch !== header) return null;
  return body.value.epoch;
}
