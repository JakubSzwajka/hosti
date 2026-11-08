# The static landing page, served by Caddy on :80.
# Build context: landing/. Only the site files go into the web root.
FROM caddy:2.11.9-alpine@sha256:0bbb055bda6793c999bde78b1b5ce3e89f829fb031af2cf50056ea1246559fee

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
