# The static landing page, served by Caddy on :80.
# Build context: landing/. Only the site files go into the web root.
FROM caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0

COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html icon.svg og-image.png apple-touch-icon.png /srv/
COPY styles/ /srv/styles/
COPY docs/ /srv/docs/

# The caddy binary has cap_net_bind_service, so a non-root user can bind :80.
RUN chown -R 65534:65534 /config /data

# Last before USER: it changes every release. The one step after it only rewrites the
# Caddyfile placeholder with the first 12 characters, so that layer is a few kB.
ARG APP_COMMIT=unknown
ENV APP_COMMIT=$APP_COMMIT
RUN commit="$(printf '%s' "$APP_COMMIT" | cut -c1-12)" \
  && sed -i "s/__APP_COMMIT__/${commit}/g" /etc/caddy/Caddyfile

USER 65534:65534

EXPOSE 80
