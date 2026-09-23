import { NodeStream } from "@effect/platform-node";
import type { Readable } from "node:stream";
import { StorageError } from "@hosti/storage";
import { PushError } from "@/server/errors";

export function effectReadable(source: Readable, code: string, message: string) {
  return NodeStream.fromReadable({
    evaluate: () => source,
    onError: (cause) => toStorageError(code, message, cause),
  });
}

export function toPushError(error: StorageError): PushError {
  return new PushError(error.code, error.message, error.status);
}

function toStorageError(code: string, prefix: string, cause: unknown): StorageError {
  if (cause instanceof StorageError) return cause;
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new StorageError({ code, message: `${prefix}: ${detail}`, status: 400 });
}
