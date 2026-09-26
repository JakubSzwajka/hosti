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
    const { flags } = parseFlags(["--allow-absolute", "--yes", "--open"]);
    expect(flags).toEqual({ allowAbsolute: true, yes: true, open: true });
  });

  it("keeps positionals in order", () => {
    const { positionals } = parseFlags(["push", "./dist", "--slug", "atlas"]);
    expect(positionals).toEqual(["push", "./dist"]);
  });

  it("refuses a value flag with nothing after it", () => {
    expect(() => parseFlags(["--slug"])).toThrow(UsageError);
    expect(() => parseFlags(["--slug", "--yes"])).toThrow(UsageError);
  });

  it("refuses a flag it does not know", () => {
    expect(() => parseFlags(["--expires", "7d"])).toThrow(/Unknown flag --expires/);
  });

  it("refuses the flags the one-link model took away", () => {
    for (const flag of ["--share", "--unlisted", "--remove", "--set"]) {
      expect(() => parseFlags([flag, "x"])).toThrow(/Unknown flag/);
    }
  });
});

describe("what the command means", () => {
  it("reads a push", () => {
    expect(parseInvocation(["push", "./dist", "--slug", "atlas", "--title", "Atlas"])).toEqual({
      kind: "run",
      command: "push",
      target: "./dist",
      flags: { slug: "atlas", title: "Atlas" },
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
    for (const command of ["share", "rotate", "rm", "open", "prune"]) {
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

  it("refuses the commands the one-link model took away", () => {
    for (const command of ["links", "revoke", "pin"]) {
      expect(() => parseInvocation([command, "atlas"])).toThrow(/Unknown command/);
    }
  });
});

describe("the sharing flags", () => {
  it("reads a mode and a pin", () => {
    expect(parseInvocation(["share", "atlas", "--mode", "pin", "--pin", "4821"])).toMatchObject({
      command: "share",
      target: "atlas",
      flags: { mode: "pin", pin: "4821" },
    });
  });

  it("takes all three modes", () => {
    for (const mode of ["private", "link", "pin"]) {
      const parsed = parseInvocation(["share", "atlas", "--mode", mode]);
      expect(parsed).toMatchObject({ command: "share", flags: { mode } });
    }
  });

  it("needs a mode to share", () => {
    expect(() => parseInvocation(["share", "atlas"])).toThrow(/needs --mode/);
  });

  it("refuses a mode it does not know", () => {
    expect(() => parseInvocation(["share", "atlas", "--mode", "unlisted"])).toThrow(
      /--mode is one of/,
    );
  });

  it("refuses a pin under any mode but pin", () => {
    for (const mode of ["private", "link"]) {
      expect(() => parseInvocation(["share", "atlas", "--mode", mode, "--pin", "4821"])).toThrow(
        /--pin only goes with --mode pin/,
      );
    }
  });

  it("refuses --mode and --pin where they mean nothing", () => {
    expect(() => parseInvocation(["rotate", "atlas", "--mode", "link"])).toThrow(/means nothing/);
    expect(() => parseInvocation(["push", "./d", "--slug", "a", "--pin", "4821"])).toThrow(
      /means nothing/,
    );
  });
});

describe("connecting an agent", () => {
  it("reads a login with a name and a request for delete", () => {
    expect(
      parseInvocation(["login", "https://hosti.example.com", "--name", "ci box", "--allow-delete"]),
    ).toEqual({
      kind: "run",
      command: "login",
      target: "https://hosti.example.com",
      flags: { name: "ci box", allowDelete: true },
    });
  });

  it("needs the server URL to log in, and makes its own token", () => {
    expect(() => parseInvocation(["login"])).toThrow(/login needs the server URL/);
    expect(() => parseInvocation(["login", "https://h.example", "--token", "hosti_x"])).toThrow(
      /makes its own token/,
    );
  });

  it("keeps --name and --allow-delete to login", () => {
    expect(() => parseInvocation(["push", "./d", "--slug", "a", "--name", "x"])).toThrow(
      /means nothing/,
    );
    expect(() => parseInvocation(["whoami", "--allow-delete"])).toThrow(/means nothing/);
  });

  it("takes no argument for whoami and logout", () => {
    expect(parseInvocation(["whoami"])).toMatchObject({ command: "whoami", target: "" });
    expect(parseInvocation(["logout"])).toMatchObject({ command: "logout", target: "" });
    expect(() => parseInvocation(["whoami", "atlas"])).toThrow(/takes no argument/);
  });
});
