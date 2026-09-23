# syntax=docker/dockerfile:1.7
# Debian rather than Alpine: better-sqlite3 ships glibc prebuilds, and the
# fallback node-gyp build needs a toolchain that Alpine would also need.
# Keep the tag in step with .nvmrc.
FROM node:24.21.0-bookworm-slim AS base
WORKDIR /app
ENV npm_config_update_notifier=false

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
# npm 11 reads the allowScripts field in the root package.json and refuses
# --allow-scripts on a project install.
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @hosti/web

FROM base AS runtime
ENV NODE_ENV=production \
  HOSTI_DATA_DIR=/data \
  PORT=3000 \
  HOSTNAME=0.0.0.0

RUN mkdir -p /data && chown -R node:node /data
WORKDIR /app/apps/web

# Next's standalone output carries its own pruned node_modules, plus the
# schema.sql that next.config.ts adds to the file trace.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone /app
COPY --from=build --chown=node:node /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/scripts /app/apps/web/scripts
COPY --from=build --chown=node:node /app/apps/web/src/server/db /app/apps/web/src/server/db

USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
