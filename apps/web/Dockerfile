# syntax=docker/dockerfile:1.7
# Debian rather than Alpine: better-sqlite3 ships glibc prebuilds, and the
# fallback node-gyp build needs a toolchain that Alpine would also need.
# Keep the tag in step with .nvmrc. Tag plus digest, literal so Dependabot bumps both.
FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS base
WORKDIR /app
ENV COREPACK_HOME=/corepack
RUN corepack enable

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/cli/package.json apps/cli/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/serving/package.json packages/serving/package.json
COPY packages/bundles/package.json packages/bundles/package.json
COPY packages/catalog/package.json packages/catalog/package.json
COPY packages/identity/package.json packages/identity/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY scripts/prepare-hooks.mjs scripts/prepare-hooks.mjs
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web apps/web
RUN pnpm --filter @hosti/web build
# Next traces the packages the server needs into standalone/node_modules. That tree is far
# smaller than a --prod install (every workspace dependency), so keep it, but as its own
# runtime layer: it does not change on a code-only release, the rest of standalone does.
RUN mv apps/web/.next/standalone/node_modules /traced-node_modules

FROM base AS runtime
ENV NODE_ENV=production \
  HOSTI_DATA_DIR=/data \
  PORT=3000 \
  HOSTNAME=0.0.0.0

RUN mkdir -p /data && chown -R node:node /data
WORKDIR /app/apps/web

# Traced packages and native better-sqlite3 files first: same bytes every release.
COPY --from=build --chown=node:node /traced-node_modules /app/node_modules
# The app: server build, no node_modules.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone /app
COPY --from=build --chown=node:node /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/scripts /app/apps/web/scripts
COPY --from=build --chown=node:node /app/packages/catalog/package.json /app/packages/catalog/package.json
COPY --from=build --chown=node:node /app/packages/catalog/src/schema.mjs /app/packages/catalog/src/schema.mjs
# scripts/new-token.mjs imports better-sqlite3 by name. Next keeps the traced copy
# under .next/node_modules/better-sqlite3-<hash>, which plain Node cannot
# resolve, so link it where /app/apps/web/scripts finds it. The server keeps
# using its hashed path.
RUN mkdir -p /app/node_modules/@hosti \
  && ln -sfn /app/packages/catalog /app/node_modules/@hosti/catalog \
  && set -- /app/apps/web/.next/node_modules/better-sqlite3-* \
  && [ "$#" -eq 1 ] && [ -f "$1/package.json" ] \
  && ln -sfn "$(readlink -f "$1")" /app/node_modules/better-sqlite3

# Last before USER: it changes every release, so nothing but metadata may follow it.
# "Create release" passes the full commit sha; /api/health reports its first 12
# characters so the deploy can tell the new container from the old one.
ARG APP_COMMIT=unknown
ENV APP_COMMIT=$APP_COMMIT

USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
