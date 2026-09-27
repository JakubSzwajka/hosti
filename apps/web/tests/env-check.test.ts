import { describe, expect, it } from "vitest";
import { checkEnvironment, digestPrefix, inspectSecret } from "../scripts/env-check.mjs";

const CLEAN_ENV = {
  HOSTI_OWNER_PASSWORD: "abcd12efg!@#",
  HOSTI_SECRET: "a".repeat(64),
  HOSTI_DATA_DIR: "/data",
  HOSTI_PUBLIC_URL: "https://hosti.example.com",
  PORT: "3000",
};

function output(env: Record<string, string | undefined>): string {
  return checkEnvironment(env).lines.join("\n");
}

describe("the env doctor's verdict", () => {
  it("passes when both secrets are set and clean", () => {
    const { code, lines } = checkEnvironment(CLEAN_ENV);
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("both secrets are set and clean");
  });

  it("fails when a secret is missing", () => {
    expect(checkEnvironment({ ...CLEAN_ENV, HOSTI_OWNER_PASSWORD: undefined }).code).toBe(1);
    expect(checkEnvironment({ ...CLEAN_ENV, HOSTI_SECRET: "" }).code).toBe(1);
  });

  it("fails when a secret carries stray whitespace", () => {
    expect(checkEnvironment({ ...CLEAN_ENV, HOSTI_OWNER_PASSWORD: "hunter2 " }).code).toBe(1);
  });
});

describe("what the doctor refuses to print", () => {
  it("keeps the value out of the report, clean or not", () => {
    const secret = "super-secret-value";
    for (const value of [secret, ` ${secret}`, `'${secret}'`, `${secret}\r`]) {
      const text = output({ ...CLEAN_ENV, HOSTI_OWNER_PASSWORD: value });
      expect(text).not.toContain(secret);
      expect(text).not.toContain("super");
    }
  });

  it("shows only the first 8 hex characters of the digest", () => {
    const report = inspectSecret("HOSTI_SECRET", "hunter2");
    expect(report.digest).toBe(digestPrefix("hunter2"));
    expect(report.digest).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("the shapes that broke a deployment", () => {
  it("names a trailing space and a trailing carriage return apart", () => {
    expect(inspectSecret("X", "value ").warnings).toEqual(["trailing whitespace: a space"]);
    expect(inspectSecret("X", "value\r").warnings).toEqual([
      "trailing whitespace: a carriage return (\\r)",
    ]);
    expect(inspectSecret("X", " value").warnings).toEqual(["leading whitespace: a space"]);
  });

  it("reports the digest Hosti actually uses when the value needs trimming", () => {
    const report = inspectSecret("X", "value ");
    expect(report.digest).toBe(digestPrefix("value "));
    expect(report.trimmedDigest).toBe(digestPrefix("value"));
  });

  it("flags a quote that leaked into the value", () => {
    expect(inspectSecret("X", "'quoted-value-with-literal-quotes'").warnings[0]).toContain(
      "wrapped in '",
    );
    expect(inspectSecret("X", '"quoted"').warnings[0]).toContain('wrapped in "');
    expect(inspectSecret("X", "it's fine").warnings).toEqual([]);
  });

  it("flags a doubled escape and a control character", () => {
    expect(inspectSecret("X", "secr$$tone").warnings[0]).toContain("$$");
    expect(inspectSecret("X", "two\tparts").warnings[0]).toContain("control character");
  });

  it("counts characters, not bytes", () => {
    expect(inspectSecret("X", "zażółć").length).toBe(6);
  });
});

describe("the plain settings", () => {
  it("prints them as they are and says when one is unset", () => {
    const text = output({ ...CLEAN_ENV, PORT: undefined });
    expect(text).toContain("HOSTI_PUBLIC_URL https://hosti.example.com");
    expect(text).toContain("PORT             (unset)");
  });
});
