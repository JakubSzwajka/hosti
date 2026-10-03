#!/usr/bin/env node
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const OWNER_HASH_VAR = "HOSTI_OWNER_PASSWORD_HASH";
const OBSOLETE_OWNER_VAR = "HOSTI_OWNER_PASSWORD";
const SECRET_VARS = [OWNER_HASH_VAR, "HOSTI_SECRET"];
const OWNER_HASH_PATTERN = /^scrypt:16384:8:1:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/;
const PLAIN_VARS = ["HOSTI_DATA_DIR", "HOSTI_PUBLIC_URL", "PORT"];

const WHITESPACE_NAMES = {
  " ": "a space",
  "\t": "a tab",
  "\n": "a newline (\\n)",
  "\r": "a carriage return (\\r)",
  "\v": "a vertical tab (\\v)",
  "\f": "a form feed (\\f)",
  "\u00a0": "a non-breaking space (U+00A0)",
  "\ufeff": "a byte order mark (U+FEFF)",
};

export function digestPrefix(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 8);
}

function nameWhitespace(run) {
  return [...run]
    .map(
      (char) => WHITESPACE_NAMES[char] ?? `U+${char.codePointAt(0).toString(16).padStart(4, "0")}`,
    )
    .join(", then ");
}

function controlCharacterNames(value) {
  const found = [];
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code < 0x20 || code === 0x7f) {
      const label = WHITESPACE_NAMES[char] ?? `U+${code.toString(16).padStart(4, "0")}`;
      if (!found.includes(label)) found.push(label);
    }
  }
  return found;
}

export function inspectSecret(name, raw) {
  if (raw === undefined || raw === "") {
    return { name, set: false, warnings: [], problem: true };
  }

  const trimmed = raw.trim();
  const leading = raw.slice(0, raw.length - raw.trimStart().length);
  const trailing = raw.slice(raw.trimEnd().length);
  const warnings = [];

  if (leading) warnings.push(`leading whitespace: ${nameWhitespace(leading)}`);
  if (trailing) warnings.push(`trailing whitespace: ${nameWhitespace(trailing)}`);

  const first = trimmed.at(0);
  if (trimmed.length > 1 && (first === "'" || first === '"') && trimmed.at(-1) === first) {
    warnings.push(`the value is wrapped in ${first} characters, so a quote leaked into it`);
  }
  if (trimmed.includes("$$")) {
    warnings.push("the value contains $$, which usually means an escape was applied twice");
  }
  const controls = controlCharacterNames(trimmed);
  if (controls.length > 0) {
    warnings.push(`the value contains a control character: ${controls.join(", ")}`);
  }

  return {
    name,
    set: true,
    length: [...raw].length,
    digest: digestPrefix(raw),
    trimmedDigest: trimmed === raw ? null : digestPrefix(trimmed),
    warnings,
    problem: warnings.length > 0,
  };
}

export function inspectOwnerHash(raw) {
  const report = inspectSecret(OWNER_HASH_VAR, raw);
  if (!report.set) return report;
  // The image does not ship @hosti/identity, so this pattern is a copy of its own.
  const wellFormed = OWNER_HASH_PATTERN.test(raw.trim());
  return { ...report, wellFormed, problem: report.problem || !wellFormed };
}

function reportLines(report) {
  if (!report.set) {
    return [report.name, "  set       no", "  missing   this variable is unset or empty"];
  }
  const lines = [
    report.name,
    "  set       yes",
    `  length    ${report.length} characters`,
    `  sha256    ${report.digest} (first 8 hex characters)`,
  ];
  for (const warning of report.warnings) lines.push(`  warning   ${warning}`);
  if (report.trimmedDigest) {
    lines.push(`  in use    Hosti trims first, so it uses sha256 ${report.trimmedDigest}`);
  }
  if (report.wellFormed === true) lines.push("  format    a well-formed scrypt hash");
  if (report.wellFormed === false) {
    lines.push(
      "  warning   not a well-formed scrypt hash, so Hosti treats it as unset",
      "            expected scrypt:16384:8:1:<salt>:<key>; make one with pnpm owner:hash",
    );
  }
  if (report.warnings.length === 0 && report.wellFormed !== false) {
    lines.push("  clean     no stray whitespace, quotes or escapes");
  }
  return lines;
}

const HOW_TO_COMPARE = [
  "Compare without revealing anything:",
  "  1. In the running container, open the service Terminal in Dokploy and",
  "     run:  node scripts/env-check.mjs",
  "  2. On your own machine, digest the value you believe you set, the hash",
  "     from pnpm owner:hash for HOSTI_OWNER_PASSWORD_HASH:",
  "       printf '%s' 'the-value-you-set' | shasum -a 256 | cut -c1-8",
  "     On Linux use sha256sum in place of shasum -a 256.",
  "  3. The two sha256 values must match. If they differ, the container holds",
  "     a different value from the one you set, whatever the panel shows.",
  "Keep the single quotes. Unquoted, a shell and Dokploy's environment editor",
  "both mangle a ! or a # before anything downstream sees the value.",
];

export function checkEnvironment(env) {
  const reports = SECRET_VARS.map((name) =>
    name === OWNER_HASH_VAR ? inspectOwnerHash(env[name]) : inspectSecret(name, env[name]),
  );
  const lines = ["hosti env check", ""];

  for (const report of reports) {
    lines.push(...reportLines(report), "");
  }

  if (env[OBSOLETE_OWNER_VAR] !== undefined && env[OBSOLETE_OWNER_VAR] !== "") {
    lines.push(
      `${OBSOLETE_OWNER_VAR}`,
      "  warning   still set, and ignored. Hosti reads only HOSTI_OWNER_PASSWORD_HASH.",
      "            Remove it from the environment.",
      "",
    );
  }

  lines.push("Plain settings, no secret among them");
  for (const name of PLAIN_VARS) {
    const value = env[name];
    lines.push(`  ${name.padEnd(17)}${value === undefined || value === "" ? "(unset)" : value}`);
  }
  lines.push("");

  lines.push(...HOW_TO_COMPARE, "");

  const problems = reports.filter((report) => report.problem);
  const names = problems.map((report) => report.name).join(" and ");
  lines.push(
    problems.length === 0
      ? "Result: both secrets are set and clean."
      : `Result: ${names} ${problems.length === 1 ? "needs" : "need"} fixing.`,
  );

  return { lines, code: problems.length === 0 ? 0 : 1 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { lines, code } = checkEnvironment(process.env);
  process.stdout.write(`${lines.join("\n")}\n`);
  process.exitCode = code;
}
