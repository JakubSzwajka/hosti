const fixtureRoot = "tools/playbook-checks/tests/fixtures/checker";

export function checkerFixtureConfig(name, overrides = {}) {
  const root = `${fixtureRoot}/${name}`;
  return {
    scanRoots: [root],
    tsconfigFiles: [`${root}/tsconfig.json`],
    testRoots: [`${root}/tests`],
    publicEntries: ["index.ts"],
    generatedRoots: [],
    ignoredDirectories: ["node_modules"],
    directoryNameExceptions: [],
    maxSiblings: 10,
    ownerlessBasenames: ["helpers", "misc", "utils"],
    ...overrides,
  };
}
