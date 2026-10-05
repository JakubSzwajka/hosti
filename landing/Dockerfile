# The static landing page, served by Caddy on :80.
# Build context: landing/. Only the site files go into the web root.
FROM caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b

ARG APP_COMMIT=unknown
ENV APP_COMMIT=$APP_COMMIT

COPY Caddyfile /etc/caddy/Caddyfile
RUN commit="$(printf '%s' "$APP_COMMIT" | cut -c1-12)" \
  && sed -i "s/__APP_COMMIT__/${commit}/g" /etc/caddy/Caddyfile
COPY index.html icon.svg og-image.png /srv/
COPY styles/ /srv/styles/
COPY docs/ /srv/docs/

# The caddy binary has cap_net_bind_service, so a non-root user can bind :80.
RUN chown -R 65534:65534 /config /data
USER 65534:65534

EXPOSE 80
