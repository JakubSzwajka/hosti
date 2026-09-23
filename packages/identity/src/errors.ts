import { Schema } from "effect";

export class IdentityInputError extends Schema.TaggedError<IdentityInputError>()(
  "IdentityInputError",
  {
    code: Schema.String,
    message: Schema.String,
    status: Schema.Int,
  },
) {}

export class IdentityDatabaseError extends Schema.TaggedError<IdentityDatabaseError>()(
  "IdentityDatabaseError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}
