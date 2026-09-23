import { Schema } from "effect";

export class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  code: Schema.String,
  message: Schema.String,
  status: Schema.Finite,
}) {}

export function storageError(code: string, message: string, status = 400): StorageError {
  return new StorageError({ code, message, status });
}
