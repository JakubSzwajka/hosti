---
name: add-a-route
description: Add an API handler or catalog page route to Hosti using its existing Next.js, server, auth, and test conventions.
---

# Add a Hosti route

Read `CONTEXT.md` before changing behavior. Hosti's terms and product rules apply to routes as they do to the rest of the app.

## Choose the route shape

- API handlers live under `apps/web/src/app/api/`. Export the HTTP method function, accept a `Request`, and return a `Response`. See `apps/web/src/app/api/v1/bundles/route.ts` and the slug-scoped handler in `apps/web/src/app/api/v1/bundles/[slug]/sharing/route.ts`.
- Catalog pages live in `apps/web/src/app/`. Dynamic page params are promises in the current Next.js version. See `apps/web/src/app/b/[slug]/page.tsx`.
- Keep database and product operations in `apps/web/src/server/`. Route handlers call those modules; server modules must not import Next delivery routes. See `apps/web/src/server/catalog.ts` and the `web-server-does-not-import-next-delivery` rule in `.dependency-cruiser.cjs`.

## Handle responses and errors

- Use `jsonResponse`, `errorResponse`, `unauthorized`, and `failureResponse` from `apps/web/src/server/api-responses.ts` for JSON endpoints. `failureResponse` maps `PushError` from `apps/web/src/server/errors.ts` and returns an internal error for other failures.
- API routes using bearer push tokens call `authenticatePush` from `apps/web/src/server/push-tokens.ts`; return `unauthorized()` when it returns null. See `apps/web/src/app/api/v1/bundles/route.ts`.
- For catalog pages, use `requireAdmin()` from `apps/web/src/server/auth/admin.ts`; it redirects unauthenticated visitors to `/login`. For catalog mutation handlers, call `guardSession` or `guardMutation` from the same module. Mutations use the session cookie and mutation token, not a push token. See `apps/web/src/app/b/[slug]/sharing/route.ts`.
- Keep each route's error mapping consistent with its response type. The JSON push API and catalog form routes use different response patterns; follow the closest existing route.

## Test the route

- Add route tests under `apps/web/tests/`. Vitest is configured by `apps/web/vitest.config.ts`.
- Import route functions directly, as `apps/web/tests/admin-routes.test.ts` does. Build `Request` objects and provide promised params for dynamic routes.
- Use `useTempDataDir`, `tarFixture`, and related fixtures from `apps/web/tests/helpers.ts` when the route needs catalog data. Existing tests set auth secrets before dynamically importing route modules; follow that order when module initialization depends on environment values.
- Cover the refusal path as well as success. Admin mutation tests check missing sessions and invalid mutation tokens; bearer API tests check missing or invalid push tokens.

## Run checks

From the repository root:

```sh
pnpm check
pnpm test
pnpm build
```

`pnpm check` includes exact pins, environment schema validation, Biome, ESLint, workspace typechecks, and Dependency Cruiser. Run all three commands after a route change.
