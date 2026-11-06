# The static landing page, served by Caddy on :80.
# Build context: landing/. Only the site files go into the web root.
FROM caddy:2.11.8-alpine@sha256:f6228111e5fafa1a5238258d0858e103f10599b8d1659a146e7726681a002bb9

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
