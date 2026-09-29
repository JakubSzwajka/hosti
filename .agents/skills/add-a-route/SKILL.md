---
name: add-a-route
description: Add an API handler or catalog page route to Hosti using its existing Next.js, use-case, auth, and test conventions.
---

# Add a Hosti route

Read `CONTEXT.md` before changing behavior. Use Hosti's terms and keep its product rules intact.

## Put work in the right layer

- Delivery lives in `apps/web/src/app/`. API handlers accept `Request` and return `Response`; catalog pages use promised route params. See `apps/web/src/app/api/v1/bundles/route.ts` and `apps/web/src/app/b/[slug]/page.tsx`.
- Add one `Effect.fn` use-case per product action under `apps/web/src/use-cases/`. Compose public `@hosti/*` package services there. Do not import Next, `Request`/`Response`, or `apps/web/src/server/` from a use-case.
- Route and page code adapts its inputs, calls the use-case through `runAppUseCase` in `apps/web/src/app/_http/run-use-case.ts`, then maps the result to HTTP or UI. `apps/web/src/server/runtime.ts` owns the sole `ManagedRuntime` and is the only place that runs Effects for delivery.
- Delivery may use `server/auth/admin.ts`, `server/auth/cookie.ts`, `server/config.ts`, `server/api-responses.ts`, `server/errors.ts`, and `server/serving/**` for Next, HTTP, configuration, and Node glue. Import package constants and pure helpers directly when needed.
- `src/server` has no domain adapters. Delivery sends product actions through use-cases; server serving and auth glue may call public `@hosti/*` operations through `runtime.ts`. Dependency Cruiser enforces `delivery-reaches-domain-through-use-cases`, `use-cases-do-not-import-outer-layers`, `server-does-not-import-delivery`, and `web-tests-import-only-server-test-glue`.

## Map failures at the edge

- JSON handlers use `jsonResponse`, `errorResponse`, `unauthorized`, and `failureResponse` from `server/api-responses.ts`. The shared app helper turns expected package failures into `PushError`; `failureResponse` maps it to the existing JSON shape.
- For catalog forms, use `requireAdmin()`, `guardSession()`, or `guardMutation()` from `server/auth/admin.ts`. Preserve redirects, status codes, headers, and body text.
- Keep route-specific failure mapping close to the handler. Follow the nearest existing route when JSON APIs and catalog forms differ.

## Test the route

- Add route tests under `apps/web/src/tests/`. Vitest is configured by `apps/web/vitest.config.ts`.
- Import route functions directly, as `apps/web/src/tests/admin-routes.test.ts` does. Build `Request` objects and pass promised params for dynamic routes.
- Seed catalog and identity state through `apps/web/src/tests/support.ts`; use `useTempDataDir`, `tarFixture`, and related helpers from `apps/web/src/tests/test-fixtures.ts` when needed. Tests may import only `runtime.ts`, `config.ts`, `auth/config.ts`, and `auth/cookie.ts` from `src/server/`. Set auth values before importing the route module.
- Cover refusal and success paths. Admin mutation tests check missing sessions and invalid mutation tokens; bearer API tests check absent or invalid push tokens.

## Run checks

From the repository root, run:

```sh
pnpm check
pnpm test
pnpm build
```
