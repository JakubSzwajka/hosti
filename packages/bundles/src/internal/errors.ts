import type { CatalogError } from "@hosti/catalog";
import type { StorageError } from "@hosti/storage";
import { BundlesError } from "../bundles-error";

export function internalBundlesError(cause: unknown): BundlesError {
  return new BundlesError({
    code: "internal_error",
    message: cause instanceof Error ? cause.message : String(cause),
    status: 500,
  });
}

export function catalogBundlesError(error: CatalogError): BundlesError {
  return internalBundlesError(error);
}

export function storageBundlesError(error: StorageError): BundlesError {
  return new BundlesError({
    code: error.code,
    message: error.message,
    status: error.status,
  });
}
