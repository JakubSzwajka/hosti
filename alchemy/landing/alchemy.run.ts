import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Docker from "@alchemy.run/docker";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

const PROD_HOST = "hosti.kubaszwajka.com";
const NEXT_HOST = "hosti-next.kubaszwajka.com";
const TRAEFIK_NAME = "hosti-landing-alch";

const LandingVersion = Config.schema(
  Schema.String.check(Schema.isPattern(/^v\d+\.\d+\.\d+$/)),
  "LANDING_VERSION",
);
const LandingHost = Config.Literals([PROD_HOST, NEXT_HOST], "LANDING_HOST");

export default Alchemy.Stack(
  "hosti-landing",
  {
    providers: Layer.mergeAll(Docker.providers(), Cloudflare.providers()),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const version = yield* LandingVersion;
    const host = yield* LandingHost;
    const image = `ghcr.io/jakubszwajka/hosti:landing-${version}`;

    const manager = yield* Docker.Context("hetzner-manager", {
      name: "hosti-landing-hetzner-manager",
      docker: "host=ssh://hetzner-manager",
      description: "hetzner Swarm manager (hosti-landing stack)",
    });

    const service = yield* Docker.Service("hosti-landing", {
      context: manager,
      // Alchemy silently takes over a live service with this name; Dokploy's landing app differs.
      name: "hosti-landing",
      image,
      replicas: 1,
      placement: { constraints: ["node.labels.tier==dev"] },
      networks: ["dokploy-network"],
      healthcheck: {
        // caddy:alpine has busybox wget; the image has no healthcheck of its own.
        cmd: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1/healthz"],
        interval: "30s",
        timeout: "5s",
        retries: 3,
        startPeriod: "10s",
      },
      // start-first keeps the page up during a deploy; a static site has no shared state.
      updateConfig: { parallelism: 1, order: "start-first", failureAction: "rollback" },
      restartPolicy: { condition: "any", delay: "5s" },
      labels: {
        "managed-by": "alchemy",
        stack: "hosti-landing",
        "traefik.enable": "true",
        "traefik.swarm.network": "dokploy-network",
        [`traefik.http.services.${TRAEFIK_NAME}.loadbalancer.server.port`]: "80",
        [`traefik.http.routers.${TRAEFIK_NAME}-web.rule`]: `Host(\`${host}\`)`,
        [`traefik.http.routers.${TRAEFIK_NAME}-web.entrypoints`]: "web",
        [`traefik.http.routers.${TRAEFIK_NAME}-web.middlewares`]: "redirect-to-https@file",
        [`traefik.http.routers.${TRAEFIK_NAME}-web.service`]: TRAEFIK_NAME,
        [`traefik.http.routers.${TRAEFIK_NAME}-websecure.rule`]: `Host(\`${host}\`)`,
        [`traefik.http.routers.${TRAEFIK_NAME}-websecure.entrypoints`]: "websecure",
        [`traefik.http.routers.${TRAEFIK_NAME}-websecure.tls.certresolver`]: "letsencrypt",
        [`traefik.http.routers.${TRAEFIK_NAME}-websecure.service`]: TRAEFIK_NAME,
      },
    });

    // The hosti.kubaszwajka.com record is owned outside Alchemy, so only hosti-next gets one here.
    if (host === NEXT_HOST) {
      const zone = Cloudflare.Zone.Zone.lookup({ name: "kubaszwajka.com" });
      yield* Cloudflare.DNS.Record("hosti-next", {
        zoneId: zone.zoneId,
        name: "hosti-next",
        type: "CNAME",
        content: PROD_HOST,
        proxied: true,
      });
    }

    return { service: service.name, image, host };
  }),
);
