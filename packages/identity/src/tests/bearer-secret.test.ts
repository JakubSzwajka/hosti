import { describe, expect, it } from "vitest";
import { bearerSecret } from "../index";

describe("bearerSecret", () => {
  it("reads the trimmed secret after the Bearer prefix", () => {
    expect(bearerSecret("Bearer hosti_abc ")).toBe("hosti_abc");
  });

  it("answers null for a missing, foreign or empty credential", () => {
    expect(bearerSecret(null)).toBeNull();
    expect(bearerSecret("Basic hosti_abc")).toBeNull();
    expect(bearerSecret("bearer hosti_abc")).toBeNull();
    expect(bearerSecret("Bearer    ")).toBeNull();
  });
});
