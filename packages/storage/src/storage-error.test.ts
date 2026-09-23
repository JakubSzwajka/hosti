import { expect, it } from "@effect/vitest";
import { StorageError } from "./index";

it("constructs a typed storage error", () => {
  const error = new StorageError({
    code: "storage_io",
    message: "Storage unavailable",
    status: 500,
  });

  expect(error._tag).toBe("StorageError");
  expect(error.message).toBe("Storage unavailable");
});
