import { BundlesError } from "@hosti/bundles";
import { type Catalog, CatalogError, FenceRejected, WriterUnavailable } from "@hosti/catalog";
import { IdentityInputError } from "@hosti/identity";
import { StorageError } from "@hosti/storage";
import { PushError, WRITER_PAUSED } from "@/server/errors";
import {
  admitWriter,
  releaseWriter,
  runObservation,
  runUseCase,
  type UseCaseRequirements,
  type UseCaseResult,
} from "@/server/runtime";
import { type Effect, Schema } from "effect";

function typedFailure<S extends Schema.Top & { readonly fields: Schema.Struct.Fields }>(
  schema: S,
): (error: unknown) => error is S["Type"] {
  const branded = Schema.is(schema);
  const shaped = Schema.is(Schema.Struct(schema.fields));
  return (error): error is S["Type"] => branded(error) && shaped(error);
}

const isBundlesError = typedFailure(BundlesError);
const isStorageError = typedFailure(StorageError);
const isIdentityInputError = typedFailure(IdentityInputError);
const isFenceRejected = typedFailure(FenceRejected);
const isWriterUnavailable = typedFailure(WriterUnavailable);
const isCatalogError = typedFailure(CatalogError);

export async function runAppUseCase<A, E, R extends UseCaseRequirements>(
  effect: Effect.Effect<A, E, R>,
): Promise<A> {
  return settle(await runUseCase(effect));
}

export async function runAppObservation<A, E>(effect: Effect.Effect<A, E, Catalog>): Promise<A> {
  return settle(await runObservation(effect));
}

function settle<A, E>(result: UseCaseResult<A, E>): A {
  if (result.ok) return result.value;

  const error = result.error;
  if (isBundlesError(error) || isStorageError(error) || isIdentityInputError(error)) {
    throw new PushError(error.code, error.message, error.status);
  }
  if (isFenceRejected(error)) {
    throw new PushError(error.code, error.message, error.code === "invalid_epoch" ? 400 : 409);
  }
  if (isWriterUnavailable(error)) {
    throw new PushError(WRITER_PAUSED, error.message, 503);
  }
  if (isCatalogError(error)) {
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
