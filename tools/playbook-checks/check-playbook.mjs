import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { checkStrictMode } from "./strict-mode.mjs";

const CODE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/u;
const TEST_FILE = /\.test\.(?:[cm]?[jt]sx?)$/u;
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/u;

function relativePath(repoRoot, absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

function isInside(filePath, root) {
  return filePath === root || filePath.startsWith(`${root}/`);
}

function fileStem(fileName) {
  return fileName.replace(CODE_EXTENSION, "").replace(/\.d$/u, "");
}

function isDeclarationFile(fileName) {
  return /\.d\.[cm]?tsx?$/u.test(fileName);
}

function isPublicEntry(filePath, publicEntries) {
  return publicEntries.some((entry) =>
    entry.includes("/") ? filePath === entry : path.posix.basename(filePath) === entry,
  );
}

function walk(repoRoot, root, ignoredDirectories, generatedRoots, visitDirectory, visitFile) {
  const absoluteRoot = path.resolve(repoRoot, root);
  const visit = (directory) => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    visitDirectory(directory, entries);
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const entryPath = relativePath(repoRoot, absolutePath);
      const ignored =
        entry.isDirectory() &&
        (ignoredDirectories.includes(entry.name) ||
          generatedRoots.some((generatedRoot) => isInside(entryPath, generatedRoot)));
      if (entry.isDirectory() && !ignored) {
        visit(absolutePath);
      } else if (entry.isFile() && CODE_EXTENSION.test(entry.name)) {
        visitFile(absolutePath);
      }
    }
  };
  visit(absoluteRoot);
}

function parseSourceFile(absolutePath) {
  return ts.createSourceFile(
    absolutePath,
    readFileSync(absolutePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    absolutePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function checkExportStars(config, repoRoot, absolutePath, add) {
  const filePath = relativePath(repoRoot, absolutePath);
  if (isDeclarationFile(absolutePath) || !isPublicEntry(filePath, config.publicEntries)) {
    return;
  }
  const sourceFile = parseSourceFile(absolutePath);
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause === undefined) {
      const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
      add(
        "error",
        filePath,
        line,
        "no-bare-star-export",
        "Name the exports instead of using a bare export star.",
      );
    }
  }
}

function isNamedExport(statement, exportName) {
  if (ts.isExportDeclaration(statement) && ts.isNamedExports(statement.exportClause)) {
    return (
      !statement.isTypeOnly &&
      statement.exportClause.elements.some(
        (element) => !element.isTypeOnly && element.name.text === exportName,
      )
    );
  }
  const modifiers = statement.modifiers ?? [];
  const exported = modifiers.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);
  const defaultExport = modifiers.some(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword);
  if (!exported || defaultExport) return false;
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
    return statement.name?.text === exportName;
  }
  return (
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(
      ({ name }) => ts.isIdentifier(name) && name.text === exportName,
    )
  );
}

function checkComponentExport(repoRoot, absolutePath, add) {
  const fileName = path.basename(absolutePath);
  const stem = fileStem(fileName);
  if (!fileName.endsWith(".tsx") || !PASCAL_CASE.test(stem) || isDeclarationFile(fileName)) {
    return;
  }
  const sourceFile = parseSourceFile(absolutePath);
  if (!sourceFile.statements.some((statement) => isNamedExport(statement, stem))) {
    add(
      "warning",
      relativePath(repoRoot, absolutePath),
      1,
      "component-export-name",
      `PascalCase component files should export '${stem}' by name.`,
    );
  }
}

function checkFileName(config, repoRoot, absolutePath, add) {
  const filePath = relativePath(repoRoot, absolutePath);
  const fileName = path.basename(absolutePath);
  const stem = fileStem(fileName);
  const isTest = TEST_FILE.test(fileName);
  if (isTest && !config.testRoots.some((root) => isInside(filePath, root))) {
    add("error", filePath, 1, "test-placement", "Test files must live in a configured test root.");
  }
  const subject = isTest ? stem.replace(/\.test$/u, "") : stem.replace(/\.config$/u, "");
  const pascalComponent = fileName.endsWith(".tsx") && PASCAL_CASE.test(subject);
  if (!KEBAB_CASE.test(subject) && !pascalComponent) {
    add(
      "error",
      filePath,
      1,
      "file-name",
      "Use kebab-case, or PascalCase for a TSX component file.",
    );
  }
  if (config.ownerlessBasenames.includes(subject)) {
    add(
      "warning",
      filePath,
      1,
      "ownerless-name",
      `The basename '${subject}' does not name an owner.`,
    );
  }
}

function checkDirectory(config, repoRoot, absolutePath, entries, rootPath, add) {
  const directoryPath = relativePath(repoRoot, absolutePath);
  if (directoryPath !== rootPath) {
    const name = path.basename(absolutePath);
    const isException = config.directoryNameExceptions.some((pattern) => pattern.test(name));
    if (!KEBAB_CASE.test(name) && !isException) {
      add("error", directoryPath, 1, "directory-name", "Use kebab-case for directory names.");
    }
  }
  const codeSiblings = entries.filter((entry) => entry.isFile() && CODE_EXTENSION.test(entry.name));
  if (codeSiblings.length > config.maxSiblings) {
    add(
      "warning",
      directoryPath,
      1,
      "sibling-count",
      `${codeSiblings.length} code files share this directory; review whether a real grouping exists.`,
    );
  }
}

export function checkRepository(config, repoRoot = process.cwd()) {
  const diagnostics = [];
  const add = (severity, filePath, line, rule, message) => {
    diagnostics.push({ severity, path: filePath, line, rule, message });
  };
  checkStrictMode(repoRoot, config.tsconfigFiles, add);
  for (const root of config.scanRoots) {
    const absoluteRoot = path.resolve(repoRoot, root);
    if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) {
      add("error", root, 1, "config-root-missing", "Configured scan root does not exist.");
      continue;
    }
    walk(
      repoRoot,
      root,
      config.ignoredDirectories,
      config.generatedRoots,
      (directory, entries) => checkDirectory(config, repoRoot, directory, entries, root, add),
      (file) => {
        checkFileName(config, repoRoot, file, add);
        checkComponentExport(repoRoot, file, add);
        checkExportStars(config, repoRoot, file, add);
      },
    );
  }
  diagnostics.sort((left, right) =>
    [left.severity, left.path, left.line, left.rule]
      .join(":")
      .localeCompare([right.severity, right.path, right.line, right.rule].join(":")),
  );
  return diagnostics;
}

export function formatDiagnostic(diagnostic) {
  return `${diagnostic.path}:${diagnostic.line} ${diagnostic.severity}/${diagnostic.rule} ${diagnostic.message}`;
}

async function main() {
  const configPath = path.resolve(
    process.cwd(),
    process.argv[2] ?? "tools/playbook-checks/config.mjs",
  );
  const config = (await import(pathToFileURL(configPath).href)).default;
  const diagnostics = checkRepository(config);
  for (const diagnostic of diagnostics) {
    console.log(formatDiagnostic(diagnostic));
  }
  const errors = diagnostics.filter(({ severity }) => severity === "error").length;
  const warnings = diagnostics.length - errors;
  console.log(`playbook-check: ${errors} errors, ${warnings} warnings`);
  process.exitCode = errors === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
