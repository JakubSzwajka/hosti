const RULE_ID_SOURCE = String.raw`(?:@[\w.-]+\/)?[\w.-]+(?:\/[\w.-]+)*`;
const RULE_ID = new RegExp(`^${RULE_ID_SOURCE}$`, "u");
const RULE_LIST = String.raw`${RULE_ID_SOURCE}(?:\s*,\s*${RULE_ID_SOURCE})*`;
const LINE_TERMINATOR = /[\n\r\u2028\u2029]/u;

function plainValue(comment) {
  return comment.value.trim();
}

function blockLinesValue(comment) {
  if (comment.type !== "Block") return plainValue(comment);

  return comment.value
    .split(/\r\n|[\n\r\u2028\u2029]/u)
    .map((line) => line.trim().replace(/^\*\s?/u, ""))
    .join("\n")
    .trim();
}

function legalHeaderValue(comment) {
  if (comment.type !== "Block") return plainValue(comment);

  return blockLinesValue({ ...comment, value: comment.value.replace(/^!/u, "") });
}

function isSingleLineComment(comment) {
  return !LINE_TERMINATOR.test(comment.value);
}

function directiveAttributes(source) {
  const attributes = new Map();
  const attribute = /\s*([a-z-]+)\s*=\s*(["'])([^"'<>\r\n]*)\2/guy;
  let offset = 0;

  while (offset < source.length) {
    attribute.lastIndex = offset;
    const match = attribute.exec(source);
    if (!match || attributes.has(match[1])) return null;
    attributes.set(match[1], match[3]);
    offset = attribute.lastIndex;
  }

  return attributes;
}

function hasOnlyAttributes(attributes, required, optional = []) {
  if (attributes.size < required.length || attributes.size > required.length + optional.length) {
    return false;
  }
  return (
    required.every((name) => attributes.has(name)) &&
    [...attributes.keys()].every((name) => required.includes(name) || optional.includes(name))
  );
}

function isTripleSlashDirective(value) {
  const match = /^\/\s*<([a-z-]+)\s+(.+?)\s*\/>$/u.exec(value);
  if (!match) return false;

  const [, tag, source] = match;
  const attributes = directiveAttributes(source);
  if (!attributes) return false;

  if (tag === "amd-module") {
    return hasOnlyAttributes(attributes, ["name"]) && attributes.get("name") !== "";
  }
  if (tag === "amd-dependency") {
    return hasOnlyAttributes(attributes, ["path"], ["name"]) && attributes.get("path") !== "";
  }
  if (tag !== "reference") return false;

  if (attributes.has("no-default-lib")) {
    return (
      hasOnlyAttributes(attributes, ["no-default-lib"]) &&
      attributes.get("no-default-lib") === "true"
    );
  }
  if (attributes.has("path")) {
    return (
      hasOnlyAttributes(attributes, ["path"], ["preserve"]) &&
      attributes.get("path") !== "" &&
      (!attributes.has("preserve") || attributes.get("preserve") === "true")
    );
  }
  if (attributes.has("types")) {
    return (
      hasOnlyAttributes(attributes, ["types"], ["resolution-mode"]) &&
      attributes.get("types") !== "" &&
      (!attributes.has("resolution-mode") ||
        /^(?:import|require)$/u.test(attributes.get("resolution-mode")))
    );
  }

  return hasOnlyAttributes(attributes, ["lib"]) && attributes.get("lib") !== "";
}

function isTypeScriptDirective(comment, value) {
  if (comment.type === "Line") {
    return /^@ts-(?:check|nocheck|ignore|expect-error)$/u.test(value);
  }
  if (!isSingleLineComment(comment)) return false;

  const blockValue = value.replace(/^\*+\s*/u, "");
  return /^@ts-(?:ignore|expect-error)$/u.test(blockValue);
}

function splitJustification(value) {
  const marker = /\s-{2,}\s/u.exec(value);
  return marker ? value.slice(0, marker.index).trim() : value;
}

function isSeverity(value) {
  return /^(?:[012]|off|warn|error|["'](?:off|warn|error)["'])$/u.test(value.trim());
}

function splitTopLevel(source, delimiter) {
  const parts = [];
  let quote = null;
  let escaped = false;
  let depth = 0;
  let start = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "[" || character === "{") depth += 1;
    else if (character === "]" || character === "}") depth -= 1;
    else if (character === delimiter && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
    if (depth < 0) return null;
  }

  if (quote || depth !== 0) return null;
  parts.push(source.slice(start));
  return parts;
}

function isRuleSetting(value) {
  if (isSeverity(value)) return true;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return false;

  try {
    const setting = JSON.parse(trimmed);
    return Array.isArray(setting) && setting.length > 0 && isSeverity(String(setting[0]));
  } catch {
    return false;
  }
}

function isEslintConfiguration(value) {
  const entries = splitTopLevel(value, ",");
  if (!entries?.length) return false;

  return entries.every((entry) => {
    const separator = splitTopLevel(entry, ":");
    if (!separator || separator.length < 2) return false;
    const [ruleId, ...settingParts] = separator;
    return RULE_ID.test(ruleId.trim()) && isRuleSetting(settingParts.join(":"));
  });
}

export function isEslintDirective(comment, value = plainValue(comment)) {
  if (!isSingleLineComment(comment)) return false;

  const directive = splitJustification(value);
  const control = new RegExp(
    String.raw`^eslint-(disable(?:-line|-next-line)?|enable)(?:\s+(?:${RULE_LIST}))?$`,
    "u",
  ).exec(directive);
  if (control) {
    return comment.type === "Block" || /^(?:disable-line|disable-next-line)$/u.test(control[1]);
  }
  if (comment.type !== "Block") return false;

  const globals =
    /^(?:global|globals)\s+[\w$]+(?::(?:readonly|writable|writeable|true|false|off))?(?:\s*,\s*[\w$]+(?::(?:readonly|writable|writeable|true|false|off))?)*$/u;
  const exported = /^exported\s+[\w$]+(?:\s*,\s*[\w$]+)*$/u;
  if (globals.test(directive) || exported.test(directive)) return true;

  const configuration = /^eslint\s+(.+)$/u.exec(directive);
  return configuration ? isEslintConfiguration(configuration[1]) : false;
}

function isBiomeDirective(value) {
  return /^biome-ignore(?:-all)?\s+(?:lint(?:\/[\w-]+(?:\/[\w-]+)*)?|format|assist(?:\/[\w-]+(?:\/[\w-]+)*)?):\s+\S.*$/u.test(
    value,
  );
}

function isCoverageDirective(value) {
  return /^(?:istanbul\s+ignore\s+(?:if|else|next|file)|(?:c8|v8)\s+ignore\s+(?:next(?:\s+\d+)?|start|stop)|node:coverage\s+(?:disable|enable))$/u.test(
    value,
  );
}

function isSourceMapDirective(value) {
  return /^(?:#|@)\s*sourceMappingURL=\S+$/u.test(value);
}

function isWebpackDirective(value) {
  const quoted = String.raw`(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*')`;
  const patterns = [
    new RegExp(String.raw`^webpackChunkName:\s*${quoted}$`, "u"),
    /^webpackMode:\s*["'](?:lazy|lazy-once|eager|weak)["']$/u,
    /^webpack(?:Prefetch|Preload):\s*(?:true|false|-?\d+)$/u,
    /^webpackFetchPriority:\s*["'](?:high|low|auto)["']$/u,
    new RegExp(
      String.raw`^webpackExports:\s*(?:${quoted}|\[\s*${quoted}(?:\s*,\s*${quoted})*\s*\])$`,
      "u",
    ),
    /^webpack(?:Include|Exclude):\s*\/(?:\\.|[^/\\\r\n])+\/[dgimsuvy]*$/u,
    /^webpackIgnore:\s*(?:true|false)$/u,
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function isBundlerDirective(value) {
  if (value === "@vite-ignore") return true;

  return value
    .split(/,\s*(?=webpack[A-Z][A-Za-z]+:)/u)
    .every((directive) => isWebpackDirective(directive));
}

function isOptimizationDirective(value) {
  return /^(?:#|@)__(?:PURE|NO_SIDE_EFFECTS)__$/u.test(value);
}

function isLegalHeader(value) {
  return (
    /^SPDX-License-Identifier:\s*\S+(?:\s+WITH\s+\S+)?$/u.test(value) ||
    /^@(?:license|preserve)\b/u.test(value) ||
    /^copyright(?:\s|\(|©)/iu.test(value)
  );
}

export function isCommentException(comment, firstCodeStart) {
  const value = plainValue(comment);
  const singleLine = isSingleLineComment(comment);

  if (comment.type === "Line" && isTripleSlashDirective(value)) {
    return comment.range[1] <= firstCodeStart;
  }
  if (isTypeScriptDirective(comment, value)) {
    if (/^@ts-(?:check|nocheck)$/u.test(value)) return comment.range[1] <= firstCodeStart;
    return true;
  }
  if (isEslintDirective(comment, value)) return true;
  if (isBiomeDirective(blockLinesValue(comment))) return true;
  if (singleLine && isCoverageDirective(value)) return true;
  if (singleLine && isSourceMapDirective(value)) return true;
  if (comment.type === "Block" && singleLine && value === "@vite-ignore") return true;
  if (singleLine && value !== "@vite-ignore" && isBundlerDirective(value)) return true;
  if (comment.type === "Block" && singleLine && isOptimizationDirective(value)) return true;

  return comment.range[1] <= firstCodeStart && isLegalHeader(legalHeaderValue(comment));
}
