import { Schema } from "effect";

export class CatalogError extends Schema.TaggedError<CatalogError>()("CatalogError", {
  operation: Schema.String,
  message: Schema.String,
}) {}
