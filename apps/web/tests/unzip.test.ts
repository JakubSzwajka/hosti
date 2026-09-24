import { describe, expect, it } from "vitest";

const { slugFromFileName } = await import("@hosti/shared");

describe("the slug a dropped file suggests", () => {
  it("strips the archive extension and cleans what is left", () => {
    expect(slugFromFileName("Garmin Q3.zip")).toBe("garmin-q3");
    expect(slugFromFileName("report.tar.gz")).toBe("report");
    expect(slugFromFileName("report.tgz")).toBe("report");
    expect(slugFromFileName("/tmp/Sleep_Notes (2026).zip")).toBe("sleep-notes-2026");
  });

  it("gives back nothing when the name holds nothing usable", () => {
    expect(slugFromFileName("___.zip")).toBe("");
    expect(slugFromFileName(".zip")).toBe("");
  });

  it("never suggests a slug the server would refuse", () => {
    const long = `${"a".repeat(80)}.zip`;
    expect(slugFromFileName(long)).toHaveLength(64);
    expect(slugFromFileName("--weird--.zip")).toBe("weird");
  });
});
