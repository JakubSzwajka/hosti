export default {
  scanRoots: ["apps", "packages"],
  tsconfigFiles: [
    "apps/cli/tsconfig.json",
    "apps/web/tsconfig.json",
    "packages/shared/tsconfig.json",
  ],
  testRoots: ["apps/cli/tests", "apps/web/tests"],
  publicEntries: ["index.ts"],
  generatedRoots: ["apps/web/.next"],
  ignoredDirectories: ["node_modules"],
  directoryNameExceptions: [/^_[a-z0-9-]+$/u, /^\[[a-z0-9-]+\]$/u, /^\[\[\.\.\.[a-z0-9-]+\]\]$/u],
  maxSiblings: 10,
  ownerlessBasenames: ["helpers", "misc", "utils"],
};
