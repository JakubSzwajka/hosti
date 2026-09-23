import { expect, it } from "@effect/vitest";
import { StorageError } from "./index.js";

it("constructs a typed storage error", () => {
  const error = new StorageError({ message: "Storage unavailable" });

  expect(error._tag).toBe("StorageError");
  expect(error.message).toBe("Storage unavailable");
});
