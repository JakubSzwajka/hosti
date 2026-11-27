import { timingSafeEqual } from "node:crypto";
import { hostiNotFound } from "@/server/serving/respond";

export const PRIVATE_CHANNEL_HEADER = "x-hosti-private-channel";
export const PRIVATE_CHANNEL_SECRET = Symbol.for("hosti.privateChannelSecret");
const MIN_SECRET_LENGTH = 32;

function processSecret(): string | null {
  const secret: unknown = Reflect.get(globalThis, PRIVATE_CHANNEL_SECRET);
  return typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export function isPrivateChannel(request: Request): boolean {
  const secret = processSecret();
  const supplied = request.headers.get(PRIVATE_CHANNEL_HEADER);
  if (secret === null || supplied === null) return false;
  const expected = Buffer.from(secret, "utf8");
  const actual = Buffer.from(supplied, "utf8");
  return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
}

export function privateRoute<Args extends [Request, ...unknown[]]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    if (!isPrivateChannel(args[0])) return hostiNotFound();
    return handler(...args);
  };
}
