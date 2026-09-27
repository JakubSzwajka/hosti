# syntax=docker/dockerfile:1.7
# Debian rather than Alpine: better-sqlite3 ships glibc prebuilds, and the
# fallback node-gyp build needs a toolchain that Alpine would also need.
# Keep the tag in step with .nvmrc.
FROM node:24.21.0-bookworm-slim AS base
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

FROM base AS runtime
# "Create release" passes the full commit sha; /api/health reports its first 12
# characters so the deploy can tell the new container from the old one.
ARG APP_COMMIT=unknown
ENV APP_COMMIT=$APP_COMMIT
ENV NODE_ENV=production \
  HOSTI_DATA_DIR=/data \
  PORT=3000 \
  HOSTNAME=0.0.0.0

RUN mkdir -p /data && chown -R node:node /data
WORKDIR /app/apps/web

# Next standalone output includes traced packages and native better-sqlite3 files.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone /app
COPY --from=build --chown=node:node /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/scripts /app/apps/web/scripts
COPY --from=build --chown=node:node /app/packages/catalog/package.json /app/packages/catalog/package.json
COPY --from=build --chown=node:node /app/packages/catalog/src/schema.mjs /app/packages/catalog/src/schema.mjs
RUN mkdir -p /app/node_modules/@hosti \
  && ln -sfn /app/packages/catalog /app/node_modules/@hosti/catalog

USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
