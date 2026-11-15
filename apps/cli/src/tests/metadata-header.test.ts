import { describe, expect, it } from "vitest";
import { decodeMetadataHeader, encodeMetadataHeader } from "@hosti/shared";

describe("metadata headers", () => {
  it.each(["ASCII title", "100% complete", "utf8:legacy", "Raport: zażółć gęślą jaźń 🚀"])(
    "roundtrips %s",
    (value) => {
      expect(decodeMetadataHeader(encodeMetadataHeader(value))).toBe(value);
    },
  );

  it("roundtrips literal percent sequences in the explicit encoded header", () => {
    const encoded = encodeMetadataHeader("utf8:%41 and 100%");
    expect(encoded).toBe("utf8%3A%2541%20and%20100%25");
    expect(decodeMetadataHeader(encoded)).toBe("utf8:%41 and 100%");
  });

  it("rejects malformed encoded values", () => {
    expect(() => decodeMetadataHeader("utf8:%E0%A4%A")).toThrow();
    expect(() => decodeMetadataHeader("utf8:%FF")).toThrow();
  });
});
