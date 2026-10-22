import { describe, expect, it } from "vitest";
import { formatTotal } from "@/app/_ui/format";
import { parseView } from "@/app/_ui/catalog-screen";

describe("formatTotal", () => {
  it("scales to kB, MB and GB", () => {
    expect(formatTotal(0)).toBe("0 kB");
    expect(formatTotal(23_000)).toBe("23 kB");
    expect(formatTotal(8_500_000)).toBe("8.5 MB");
    expect(formatTotal(2_340_000_000)).toBe("2.34 GB");
  });
});

describe("parseView", () => {
  it("is the gallery unless the param says table", () => {
    expect(parseView(undefined)).toBe("gallery");
    expect(parseView("gallery")).toBe("gallery");
    expect(parseView("nonsense")).toBe("gallery");
    expect(parseView("table")).toBe("table");
    expect(parseView(["table", "gallery"])).toBe("table");
  });
});
