import type { AbsoluteRef } from "./absolute-refs.ts";

const LABEL = 9;

export type Writer = (line: string) => void;

export const stdout: Writer = (line) => process.stdout.write(`${line}\n`);
export const stderr: Writer = (line) => process.stderr.write(`${line}\n`);

export function say(write: Writer, label: string, rest = ""): void {
  write(rest ? `${label.padEnd(LABEL)}${rest}` : label);
}

export function table(write: Writer, rows: string[][]): void {
  if (rows.length === 0) return;
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    });
  }
  for (const row of rows) {
    const line = row
      .map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)))
      .join("  ")
      .trimEnd();
    write(line);
  }
}

export function warnAbsoluteRefs(write: Writer, refs: AbsoluteRef[], slug: string): void {
  if (refs.length === 0) return;
  const count =
    refs.length === 1 ? "1 root-absolute reference" : `${refs.length} root-absolute references`;
  say(write, "warning", `${count} will 404 under /v/${slug}/`);
  table(
    (line) => write(`${" ".repeat(LABEL + 3)}${line}`),
    refs.map((ref) => [`${ref.file}:${ref.line}`, ref.snippet]),
  );
  write(`${" ".repeat(LABEL + 1)}fix them, or push anyway with --allow-absolute`);
}
