import { BundlesError } from "@hosti/bundles";
import { CatalogError, FenceRejected, WriterUnavailable } from "@hosti/catalog";
import { IdentityInputError } from "@hosti/identity";
import { StorageError } from "@hosti/storage";
import { PushError, WRITER_PAUSED } from "@/server/errors";
import { admitWriter, releaseWriter, runUseCase, type UseCaseRequirements } from "@/server/runtime";
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
  if (error instanceof FenceRejected) {
    throw new PushError(error.code, error.message, error.code === "invalid_epoch" ? 400 : 409);
  }
  if (error instanceof WriterUnavailable) {
    throw new PushError(WRITER_PAUSED, error.message, 503);
  }
  if (error instanceof CatalogError) {
    throw new PushError("internal_error", error.message, 500);
  }
  throw error;
}

export async function withWriter<A>(work: () => Promise<A>): Promise<A> {
  const permit = await admitWriter();
  if (permit === null) {
    throw new PushError(WRITER_PAUSED, "Writes are paused while Hosti hands over its data", 503);
  }
  try {
    return await work();
  } finally {
    releaseWriter(permit);
  }
}
