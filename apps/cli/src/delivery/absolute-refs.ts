import fs from "node:fs/promises";
import path from "node:path";

export type AbsoluteRef = {
  file: string;
  line: number;
  snippet: string;
};

const ATTRIBUTE = /\b(href|src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/gi;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s"']+))\s*\)/gi;
const MAX_SNIPPET = 120;

function isRootAbsolute(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

function hasRootAbsolute(attribute: string, value: string): boolean {
  if (attribute.toLowerCase() !== "srcset") return isRootAbsolute(value.trim());
  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
    .some(isRootAbsolute);
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === "\n") line += 1;
  return line;
}

function shorten(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_SNIPPET ? `${oneLine.slice(0, MAX_SNIPPET - 1)}…` : oneLine;
}

function enclosingTag(text: string, index: number, fallback: string): string {
  const open = text.lastIndexOf("<", index);
  if (open === -1) return shorten(fallback);
  const close = text.indexOf(">", index);
  if (close === -1 || close - open > MAX_SNIPPET * 2) return shorten(fallback);
  return shorten(text.slice(open, close + 1));
}

export function findAbsoluteRefs(html: string, file: string): AbsoluteRef[] {
  const found: AbsoluteRef[] = [];

  for (const match of html.matchAll(ATTRIBUTE)) {
    const attribute = match[1] as string;
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!hasRootAbsolute(attribute, value)) continue;
    const index = match.index ?? 0;
    found.push({ file, line: lineOf(html, index), snippet: enclosingTag(html, index, match[0]) });
  }

  for (const match of html.matchAll(CSS_URL)) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (!isRootAbsolute(value.trim())) continue;
    const index = match.index ?? 0;
    found.push({ file, line: lineOf(html, index), snippet: shorten(match[0]) });
  }

  return found.sort((a, b) => a.line - b.line);
}

export async function scanForAbsoluteRefs(root: string, files: string[]): Promise<AbsoluteRef[]> {
  const found: AbsoluteRef[] = [];
  for (const file of files) {
    if (!file.toLowerCase().endsWith(".html")) continue;
    const html = await fs.readFile(path.join(root, file), "utf8");
    found.push(...findAbsoluteRefs(html, file));
  }
  return found;
}
