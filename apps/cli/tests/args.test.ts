import { describe, expect, it } from "vitest";
import { parseFlags, parseInvocation, UsageError } from "../src/args.ts";

describe("reading the words", () => {
  it("takes a value after the flag and after an equals sign", () => {
    expect(parseFlags(["--slug", "atlas", "--title=Squad 2026"]).flags).toEqual({
      slug: "atlas",
      title: "Squad 2026",
    });
  });

  it("keeps switches apart from values", () => {
    const { flags } = parseFlags(["--share", "--unlisted", "--allow-absolute", "--yes"]);
    expect(flags).toEqual({ share: true, unlisted: true, allowAbsolute: true, yes: true });
  });

  it("keeps positionals in order", () => {
    const { positionals } = parseFlags(["push", "./dist", "--slug", "atlas"]);
    expect(positionals).toEqual(["push", "./dist"]);
  });

  it("refuses a value flag with nothing after it", () => {
    expect(() => parseFlags(["--slug"])).toThrow(UsageError);
    expect(() => parseFlags(["--slug", "--share"])).toThrow(UsageError);
  });

  it("refuses a flag it does not know", () => {
    expect(() => parseFlags(["--pin", "4821"])).toThrow(/Unknown flag --pin/);
  });
});

describe("what the command means", () => {
  it("reads a push", () => {
    expect(parseInvocation(["push", "./dist", "--slug", "atlas", "--share"])).toEqual({
      kind: "run",
      command: "push",
      target: "./dist",
      flags: { slug: "atlas", share: true },
    });
  });

  it("asks for help when there is no command", () => {
    expect(parseInvocation([]).kind).toBe("help");
    expect(parseInvocation(["push", "./dist", "--slug", "x", "--help"]).kind).toBe("help");
  });

  it("needs a path and a slug to push", () => {
    expect(() => parseInvocation(["push", "--slug", "atlas"])).toThrow(/needs a path/);
    expect(() => parseInvocation(["push", "./dist"])).toThrow(/needs --slug/);
  });

  it("needs a slug for the commands that name one", () => {
    for (const command of ["share", "links", "rm", "revoke"]) {
      expect(() => parseInvocation([command])).toThrow(/needs a slug/);
    }
  });

  it("takes ls with no argument", () => {
    expect(parseInvocation(["ls", "--collection", "reports"])).toMatchObject({
      command: "ls",
      target: "",
      flags: { collection: "reports" },
    });
  });

  it("refuses an unknown command and a second argument", () => {
    expect(() => parseInvocation(["deploy", "./dist"])).toThrow(/Unknown command/);
    expect(() => parseInvocation(["rm", "one", "two"])).toThrow(/takes one argument/);
  });

  it("refuses --unlisted where it means nothing", () => {
    expect(() => parseInvocation(["revoke", "atlas-k7", "--unlisted"])).toThrow(/means nothing/);
  });
});
