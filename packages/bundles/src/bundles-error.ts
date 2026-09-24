import { Schema } from "effect";

export class BundlesError extends Schema.TaggedError<BundlesError>()("BundlesError", {
  code: Schema.String,
  message: Schema.String,
  status: Schema.Finite,
}) {}

export class SharingWriteFailure extends Schema.TaggedError<SharingWriteFailure>()(
  "SharingWriteFailure",
  { cause: Schema.Defect() },
) {}
