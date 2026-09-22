import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// Keep this list aligned with TypeScript's documented options enabled by `strict`.
// An explicit list avoids depending on TypeScript's private optionDeclarations metadata.
export const STRICT_FAMILY_OPTIONS = [
  "alwaysStrict",
  "noImplicitAny",
  "noImplicitThis",
  "strictBindCallApply",
  "strictBuiltinIteratorReturn",
  "strictFunctionTypes",
  "strictNullChecks",
  "strictPropertyInitialization",
  "useUnknownInCatchVariables",
];

function lineForOption(source, optionName) {
  const index = source.search(new RegExp(`["']${optionName}["']\\s*:`, "u"));
  return index < 0 ? 1 : source.slice(0, index).split("\n").length;
}

export function checkStrictMode(repoRoot, tsconfigFiles, add) {
  for (const configPath of tsconfigFiles) {
    const absolutePath = path.resolve(repoRoot, configPath);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      add(
        "error",
        configPath,
        1,
        "config-tsconfig-missing",
        "Configured TypeScript config does not exist.",
      );
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    const loaded = ts.readConfigFile(absolutePath, ts.sys.readFile);
    if (loaded.error) {
      add("error", configPath, 1, "strict-mode", "TypeScript config could not be read.");
      continue;
    }
    const parsed = ts.parseJsonConfigFileContent(
      loaded.config,
      ts.sys,
      path.dirname(absolutePath),
      undefined,
      absolutePath,
    );
    if (parsed.options.strict !== true) {
      add(
        "error",
        configPath,
        lineForOption(source, "strict"),
        "strict-mode",
        "TypeScript strict mode must resolve to true.",
      );
      continue;
    }

    for (const optionName of STRICT_FAMILY_OPTIONS) {
      if (parsed.options[optionName] === false) {
        add(
          "error",
          configPath,
          lineForOption(source, optionName),
          "strict-mode",
          `TypeScript strict-family option '${optionName}' must not resolve to false.`,
        );
      }
    }
  }
}
