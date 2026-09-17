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
    expect(() => parseFlags(["--expires", "7d"])).toThrow(/Unknown flag --expires/);
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

describe("the pin flags", () => {
  it("reads a pin onto a new link", () => {
    expect(parseInvocation(["share", "atlas", "--pin", "4821"])).toMatchObject({
      command: "share",
      target: "atlas",
      flags: { pin: "4821" },
    });
  });

  it("reads set and remove on an existing link", () => {
    expect(parseInvocation(["pin", "atlas-k7", "--set", "1234"])).toMatchObject({
      command: "pin",
      target: "atlas-k7",
      flags: { set: "1234" },
    });
    expect(parseInvocation(["pin", "atlas-k7", "--remove"])).toMatchObject({
      command: "pin",
      flags: { remove: true },
    });
  });

  it("needs one of set or remove, never both and never neither", () => {
    expect(() => parseInvocation(["pin", "atlas-k7"])).toThrow(/--set <digits> or --remove/);
    expect(() => parseInvocation(["pin", "atlas-k7", "--set", "1234", "--remove"])).toThrow(
      /opposite things/,
    );
  });

  it("needs a share slug to move a pin", () => {
    expect(() => parseInvocation(["pin", "--remove"])).toThrow(/needs a slug/);
  });

  it("refuses --pin where it means nothing", () => {
    expect(() => parseInvocation(["links", "atlas", "--pin", "4821"])).toThrow(/means nothing/);
    expect(() => parseInvocation(["revoke", "atlas-k7", "--remove"])).toThrow(/means nothing/);
  });

  it("refuses a pin on a push that opens no link", () => {
    expect(() => parseInvocation(["push", "./dist", "--slug", "atlas", "--pin", "4821"])).toThrow(
      /needs a link to sit on/,
    );
    expect(
      parseInvocation(["push", "./dist", "--slug", "atlas", "--share", "--pin", "4821"]).kind,
    ).toBe("run");
  });
});
