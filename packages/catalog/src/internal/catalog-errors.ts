import { Effect } from "effect";
import { CatalogError } from "../catalog-error";

export function catalogError(operation: string, cause: unknown): CatalogError {
  return new CatalogError({ operation, message: String(cause) });
}

export function tryCatalog<A>(operation: string, run: () => A): Effect.Effect<A, CatalogError> {
  return Effect.try({
    try: run,
    catch: (cause) => catalogError(operation, cause),
  });
}
