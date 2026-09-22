# Playbook checks

This folder turns the objective parts of the code-structure playbook into one local gate:

```sh
npm run check:playbook
```

The root `npm run check` includes this command. `npm test` runs the focused checker suite before the workspace suites. The checker prints stable diagnostics:

```text
path/to/file.ts:12 error/rule-name message
path/to/folder:1 warning/rule-name message
```

Errors return a nonzero exit code. Warnings return zero.

## What the gate does

Dependency Cruiser checks resolved edges. It rejects:

- cycles;
- imports from `apps/web/src/server/` into the Next delivery tree;
- imports into `@hosti/shared` behind `packages/shared/src/index.ts`, including imports from tests;
- unresolved deep `@hosti/*/...` package specifiers that package export maps cannot resolve;
- imports from any non-test file into a configured `apps/*/tests` or `packages/*/tests` path.

Test-to-test imports are allowed. The production-to-test rule is based on the importer being outside a configured test path, so root production files are covered too.

`dependency-cruiser.tsconfig.json` extends the real `apps/web/tsconfig.json`. It supplies the base URL required by Dependency Cruiser's path resolver and restates Hosti's `@/*` mapping. Workspace packages still resolve through their package exports. The focused suite checks that the real graph has no unresolved `@/` or `@hosti/` imports.

Biome rejects TypeScript non-null assertions. Files above 300 lines are warnings because length is a design smell, not proof that a file has two jobs. Git ignore inheritance is disabled, and the config names repository exclusions directly. Biome keeps its built-in dependency exclusions. The generated exclusion names only `apps/web/.next`; source folders named `.next` or `dist` remain in scope. The focused suite invokes the real root config and proves all three paths.

`check-playbook.mjs` uses Node file APIs and the installed TypeScript compiler. It requires effective `strict: true` and rejects any strict-family option that resolves to `false`. `strict-mode.mjs` keeps an explicit list of TypeScript's documented strict-family options because the compiler's `optionDeclarations` metadata is private. Review that list when TypeScript adds a strict option. Unrelated safety options such as `noUncheckedIndexedAccess` remain allowed.

The checker also checks kebab-case paths, permits PascalCase TSX component files, and keeps `.test.ts` or `.test.tsx` files in configured test roots. A PascalCase component file warns unless it has a matching named value export. Declaration files and lowercase Next filenames are exempt. It warns when a folder has more than ten code files or a file is named `helpers`, `misc`, or `utils`. Missing scan roots and TypeScript configs produce stable configuration diagnostics instead of stack traces.

Bare `export *` is rejected only in entries named by `publicEntries`. Hosti uses `publicEntries: ["index.ts"]`. Internal files may use star exports. Declaration files keep the path and naming checks, but they are exempt from the bare-star rule because declarations may mirror an external type surface.

Comments, error design, casts, module depth, frontend library choices, and whether a large folder has a useful grouping stay in review. These rules need context.

## Hosti's narrow exceptions

Hosti does not have a `modules/` tree. Its tests live at `apps/cli/tests` and `apps/web/tests`, and many web tests exercise app internals. The config records those roots instead of forcing a product move.

The only generated root excluded by these checks is `apps/web/.next`. A folder such as `src/dist/` is still scanned. `node_modules` is ignored as a dependency folder, not as generated product code.

Next owns route names such as `[slug]` and `[[...path]]`; Hosti also uses the private `_ui` folder. The configured directory-name patterns cover those current shapes. They do not try to encode every possible Next naming convention. Tool files ending in `.config.ts` keep their framework names.

The only public workspace package entry today is `packages/shared/src/index.ts`. Add another package rule only when that package declares its own public entry.

## Proving the rules

Run the focused suite:

```sh
node --test tools/playbook-checks/check-playbook.test.mjs
```

The suite spawns the checker and proves pass, deterministic failure, and warning-only exit codes. It also spawns Dependency Cruiser against pass and fail graphs. The fail graph covers every configured rule, an `@/` server-to-delivery edge, a root production import of tests, and unresolved package-specifier deep imports from production and tests. The pass graph covers test-to-test imports and an exact public package import. A separate real-graph assertion checks all current `@/` and `@hosti/` edges resolve.

## Copying this setup

1. Copy `.dependency-cruiser.cjs` and `tools/playbook-checks/`. Install a Dependency Cruiser release compatible with the repository's Node engine. Version 18.4 requires Node `^22 || ^24 || >=26`.
2. Edit `config.mjs` to name the real scan roots, TypeScript configs, test roots, public entries, exact generated roots, and framework directory exceptions.
3. Replace Hosti's graph paths and resolver config with the repository's real aliases, delivery roots, test roots, and package entries. Delete rules for structures that do not exist.
4. Enable the linter's non-null assertion error and its 300-line warning. Exclude deliberate fixtures from the normal product lint pass.
5. Add `check:playbook` to the existing umbrella check and run the focused suite before enabling CI.

Keep import resolution in Dependency Cruiser. Keep syntax in the repository's current linter. Add a fact to the Node checker only when it has a clear counterexample and a low-false-positive test.
