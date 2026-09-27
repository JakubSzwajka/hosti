---
name: add-an-effect-module
description: Add one Effect module as a workspace package and connect it to a Hosti web use-case and delivery handler.
---

# Add an Effect module

Build one capability from the inside out: package, use-case, then delivery. Packages live under `packages/`; use-cases live in `apps/web/src/use-cases`; delivery stays in `apps/web/src/app`. Keep business logic out of routes and handlers.

Before editing Effect code, read `effect/AGENTS.md` and the relevant docs under `effect/ai-docs/` in an installed workspace copy, such as `packages/storage/node_modules/effect/AGENTS.md`. pnpm may not install `effect` at the root. Read `.agent_sources/github.com/Effect-TS/effect` for API examples. If the mirror is missing, run `pnpm vendor:agent-sources`.

## 1. Create the package

Create `packages/<name>/` with `package.json`, `tsconfig.json`, and `vitest.config.ts` based on `packages/storage`. Set the name to `@hosti/<name>`, version `0.1.0`, and the sole export to `"." : "./src/index.ts"`. Keep the `typecheck` and `test` scripts.

Every Effect package declares `effect` and pins `effect`, `@effect/vitest`, TypeScript 7.0.2, and Vitest 5.0.1 to the exact versions already used by the other Effect packages. `pnpm-workspace.yaml` sets `saveWorkspaceProtocol`, so workspace dependencies use `workspace:<exact version>`. Run `pnpm install` to update the lockfile.

## 2. Define the module

Keep domain types and expected errors in the package. Define expected errors as `Schema.TaggedError` classes and use the Effect error channel. Never fail with a global `Error` or throw inside Effect code.

Put private helpers under `src/internal/`. Export named items through `src/index.ts`; do not use `export *` or add deep package exports. Define services with `Context.Service`. Service methods should return Effects with no requirements and capture their own dependencies.

## 3. Compose it in a use-case

Add the package dependency to `@hosti/web`, then create the caller under `apps/web/src/use-cases/`. Import through the package name, never by a relative path into `packages/`.

Use `Effect.fn` for reusable use-cases. Let typed errors flow through the error channel. Use-cases must not import `src/app` routes or `src/server` modules. `apps/web/tsconfig.effect.json` typechecks use-cases with the patched TypeScript 7 compiler. Keep React components, routes, and Next.js framework code out of that project, because the main web pass turns the Effect diagnostics off for them.

## 4. Map errors in delivery

The route or handler in `apps/web/src/app/` calls the use-case and maps each typed error to an HTTP result in one place, using `Effect.catchTag` or `Effect.catchTags`. Keep request parsing, cookies, Next imports, and response construction in this delivery layer.

A delivery function may return an Effect. The entry point that owns the runtime runs it. Never call `Effect.run*` from Effect code, use-cases, or tests.

## 5. Test it

Put tests beside production code as `<file>.test.ts`. Use `@effect/vitest`, `it.effect`, and `it.layer` to provide services. Use `Effect.flip` to assert expected typed failures. Do not call `Effect.run*` or build a runtime by hand in tests.

## 6. Verify it

Run:

```sh
pnpm check
pnpm test
```

`pnpm check` runs the patched TypeScript 7 compiler everywhere. The web framework and CLI projects turn the Effect diagnostics off. Effect packages, `packages/shared`, and the web use-cases run with the full Effect diagnostics block at `error`. Fix diagnostics in code. Never lower a diagnostic to make a check pass.
