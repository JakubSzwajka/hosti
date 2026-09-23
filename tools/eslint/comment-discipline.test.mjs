import assert from "node:assert/strict";
import test from "node:test";
import { EXPECTED_MESSAGE, assertLocations, commentMessages } from "./test-helpers.mjs";

test("allows one-line comments in function, concise JSX, class, and method bodies", () => {
  const messages = commentMessages(
    `function blockBody() {
  // A remote clock can move backwards during a retry.
  return Date.now();
}

const View = () => <div>{/* Kept outside the button's focus ring. */}<button /></div>;

class Session {
  // The browser owns the lifetime of this object.
  expiresAt = 0;

  close() {
    // Revocation must happen before the socket closes.
    return true;
  }
}`,
    "allowed.tsx",
  );

  assert.deepEqual(messages, []);
});

test("rejects nested undecorated class declaration and expression headers", () => {
  const messages = commentMessages(`function outer() {
  class /* declaration keyword */ Declared<T /* declaration generic */> extends Parent<T /* declaration heritage */> {
    // The declaration body remains allowed.
    value = true;
  }

  const Expressed = class /* expression keyword */ <T /* expression generic */> extends Parent<T /* expression heritage */> {
    // The expression body remains allowed.
    value = true;
  };
}

class Container {
  Nested = class /* class-body expression header */ {
    // The nested expression body remains allowed.
    value = true;
  };
}`);

  assertLocations(messages, [
    [2, 2],
    [2, 2],
    [2, 2],
    [7, 7],
    [7, 7],
    [7, 7],
    [14, 14],
  ]);
});

test("rejects bodyless TypeScript function and method signature headers", () => {
  const messages = commentMessages(`function outer() {
  function overloaded(/* Nested overload parameter. */ value: string): string;
  function overloaded(value: string) {
    // The implementation body remains an allowed comment area.
    return value;
  }
}
declare function declared(/* Declare parameter. */ value: string): void;
abstract class Base {
  abstract method /* Abstract method header. */ <T>(value: T): void;
}
class Concrete {
  method<T>(/* Class overload parameter. */ value: T): T;
  method<T>(value: T): T {
    // The concrete method body remains an allowed comment area.
    return value;
  }
}`);

  assertLocations(messages, [
    [2, 2],
    [8, 8],
    [10, 10],
    [13, 13],
  ]);
});

test("rejects interface declaration headers and bodies", () => {
  const messages = commentMessages(`function outer() {
  interface Shape<
    // Generic parameter explanation.
    T,
  > extends Parent<
    // Heritage explanation.
    T
  > {
    // Interface body explanation.
    width: number;
  }
  // A function body remains an allowed comment area.
  return true;
}`);

  assertLocations(messages, [
    [3, 3],
    [6, 6],
    [9, 9],
  ]);
});

test("rejects decorator and header comments on decorated classes", () => {
  const messages = commentMessages(`function outer() {
  @sealed(/* Decorator argument explanation. */)
  // Between the decorator and class declaration.
  class Example<T /* Generic class header. */> extends Parent<T /* Heritage header. */> {
    // The class body remains an allowed comment area.
    value = true;
  }
}`);

  assertLocations(messages, [
    [2, 2],
    [3, 3],
    [4, 4],
    [4, 4],
  ]);
});

test("rejects module, interface, type, parameter, and decorator areas", () => {
  const messages = commentMessages(`// Module explanation.
const topLevel = true;
interface Shape {
  // Interface explanation.
  width: number;
}
type Options = {
  // Type explanation.
  enabled: boolean;
};
function parameterArea(
  // Parameter explanation.
  value: string,
) {
  return value;
}
class Example {
  @sealed // Decorator explanation.
  method() {}
  other(
    // Method parameter explanation.
    value: string,
  ) {}
}`);

  assertLocations(messages, [
    [1, 1],
    [4, 4],
    [8, 8],
    [12, 12],
    [18, 18],
    [21, 21],
  ]);
});

test("rejects multiline blocks, adjacent line groups, and multiline JSX comments", () => {
  const messages = commentMessages(
    `function example() {
  /* First line.
   * Second line. */
  const first = 1;
  // First adjacent line.
  // Second adjacent line.
  const second = 2;
  return <div>{/* First JSX line.
    Second JSX line. */}</div>;
}`,
    "multiline.tsx",
  );

  assertLocations(messages, [
    [2, 3],
    [5, 6],
    [8, 9],
  ]);
});

test("treats comments separated by code or a blank line as independent", () => {
  const messages = commentMessages(`// Before code.
const first = 1;
// After code.

// After a blank line.
const second = first; // After code on the same line.`);

  assertLocations(messages, [
    [1, 1],
    [3, 3],
    [5, 5],
    [6, 6],
  ]);
});

test("groups adjacent line comments across ECMAScript line terminators", () => {
  const terminators = ["\n", "\r\n", "\r", "\u2028", "\u2029"];

  for (const terminator of terminators) {
    const messages = commentMessages(
      `function example() {${terminator}  // First line.${terminator}  // Second line.${terminator}  return true;${terminator}}`,
    );
    assertLocations(messages, [[2, 3]]);
  }
});

test("reports one actionable diagnostic for a group that fails both rules", () => {
  const messages = commentMessages(
    "// First line.\n// Second line.\nconst value = 1;",
    "subject.js",
  );

  assert.equal(messages.length, 1);
  const [message] = messages;
  assert.equal(message.ruleId, "hosti/comment-discipline");
  assert.equal(message.message, EXPECTED_MESSAGE);
  assert.equal(message.line, 1);
  assert.equal(message.column, 1);
  assert.equal(message.endLine, 2);
  assert.equal(message.endColumn, 16);
  assert.equal(message.fix, undefined);
  assert.equal(message.suggestions, undefined);
});

test("allows comments only inside the concise arrow body boundary", () => {
  const messages = commentMessages(
    `const before = () => (/* Before the expression. */ value);
const after = () => (value /* After the expression. */);
const View = () => (/* Before JSX. */ <div /> /* After JSX. */);
const parameter = (/* Parameter explanation. */ value: string) => value;
const outside = (() => (value) /* Outside the concise body. */);`,
    "arrows.tsx",
  );

  assertLocations(messages, [
    [4, 4],
    [5, 5],
  ]);
});

test("does not treat a hashbang as a comment", () => {
  assert.deepEqual(commentMessages("#!/usr/bin/env node\nconst value = 1;", "subject.mjs"), []);
});

test("parses TypeScript and TSX syntax", () => {
  assert.deepEqual(
    commentMessages(
      "function typed(value: string): string { /* Runtime accepts only normalized values. */ return value; }",
      "typed.ts",
    ),
    [],
  );
  assert.deepEqual(
    commentMessages(
      "const View = ({ label }: { label: string }) => <span>{/* Screen readers receive the full label. */}{label}</span>;",
      "view.tsx",
    ),
    [],
  );
});
