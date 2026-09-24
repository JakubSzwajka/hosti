import { BundlesError } from "@hosti/bundles";
import { CatalogError } from "@hosti/catalog";
import { IdentityInputError } from "@hosti/identity";
import { StorageError } from "@hosti/storage";
import { PushError } from "@/server/errors";
import { runUseCase, type UseCaseRequirements } from "@/server/runtime";
import type { Effect } from "effect";

export async function runAppUseCase<A, E, R extends UseCaseRequirements>(
  effect: Effect.Effect<A, E, R>,
): Promise<A> {
  const result = await runUseCase(effect);
  if (result.ok) return result.value;

  const error = result.error;
  if (
    error instanceof BundlesError ||
    error instanceof StorageError ||
    error instanceof IdentityInputError
  ) {
    throw new PushError(error.code, error.message, error.status);
  }
  if (error instanceof CatalogError) {
    throw new PushError("internal_error", error.message, 500);
  }
  throw error;
}
