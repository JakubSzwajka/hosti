# hosti landing deploy (Alchemy)

This Alchemy stack runs the hosti landing page (see `landing/`) on the hetzner
Swarm. It replaces the Dokploy landing app. Alchemy and every `@alchemy.run/*`
package are pinned to `2.0.0-beta.87`. Bun is pinned in `mise.toml`.

```
omarchy ──ssh──► hetzner-manager   Docker.Service hosti-landing (1 replica, tier==dev)
        └─api──► Cloudflare        DNS CNAME hosti-next -> hosti.kubaszwajka.com
                                   (only when the host is hosti-next)

browser ─► Cloudflare ─► Swarm ingress ─► Dokploy Traefik (swarm provider)
                                              │ dokploy-network
                                              ▼
                                     hosti-landing task, Caddy on :80
```

## What the stack manages

| Resource | Where | Notes |
|---|---|---|
| `Docker.Context` `hosti-landing-hetzner-manager` | `ssh://hetzner-manager` | Local Docker context on the deploying machine |
| `Docker.Service` `hosti-landing` | Swarm, `node.labels.tier==dev` | Image `ghcr.io/jakubszwajka/hosti:landing-<version>`. `start-first` updates, rollback on failure. Healthcheck: busybox `wget` on `/healthz`. |
| `Cloudflare.DNS.Record` `hosti-next` | zone `kubaszwajka.com` | Proxied CNAME to `hosti.kubaszwajka.com`. Exists only while the host is `hosti-next.kubaszwajka.com`. |

The stack does not manage the Swarm, `dokploy-network`, Traefik or the DNS
record for `hosti.kubaszwajka.com`. Dokploy owns the first three. The
`hosti.kubaszwajka.com` record lives outside Alchemy.

The Swarm service name `hosti-landing` must not match a live service. Alchemy
takes over a service with the same name without a prompt. The Dokploy landing
app is `app-connect-mobile-application-q5s7yi`, so both can run side by side.

## Routing

Dokploy's Traefik reads Swarm service labels (`providers.swarm`,
`exposedByDefault: false`). The service sets these labels:

| Label | Value |
|---|---|
| `traefik.enable` | `true` |
| `traefik.swarm.network` | `dokploy-network` |
| `traefik.http.services.hosti-landing-alch.loadbalancer.server.port` | `80` |
| `traefik.http.routers.hosti-landing-alch-websecure.*` | `Host(<host>)`, entrypoint `websecure`, `tls.certresolver=letsencrypt` |
| `traefik.http.routers.hosti-landing-alch-web.*` | `Host(<host>)`, entrypoint `web`, middleware `redirect-to-https@file` |

The `hosti-landing-alch` prefix keeps these routers apart from the routers
Dokploy writes for its own apps.

## Config

`deploy.sh` takes two required arguments and passes them to the stack as
environment variables. Neither has a default.

| Argument | Variable | Rule |
|---|---|---|
| `<vX.Y.Z>` | `LANDING_VERSION` | A release tag, for example `v0.8.0`. The image `landing-<vX.Y.Z>` must exist. |
| `<host>` | `LANDING_HOST` | `hosti.kubaszwajka.com` or `hosti-next.kubaszwajka.com` |

The release workflow pushes `ghcr.io/jakubszwajka/hosti:landing-<vX.Y.Z>` for
every release. The package is public, so the Swarm pulls it without a login.

## Run

From omarchy only:

```bash
cd alchemy/landing
./deploy.sh plan   v0.8.0 hosti-next.kubaszwajka.com   # preview
./deploy.sh deploy v0.8.0 hosti-next.kubaszwajka.com   # apply (asks for approval in a terminal)
./deploy.sh drift  v0.8.0 hosti.kubaszwajka.com        # compare live resources with state
```

Extra args go to Alchemy after `--stage prod`. `--stage` and `--profile` are
refused. Set `ALCHEMY_PROFILE` to pick a profile. The Cloudflare provider uses
the Cloudflare OAuth login in that profile.

**Agents and `--yes`.** Alchemy shows no approval prompt in agent
environments: `pi` on `PATH`, CI, or no TTY. There, an agent runs
`./deploy.sh deploy <vX.Y.Z> <host> --yes`, but only after a human said yes to
that exact deploy, with the plan in front of them.

## Roll back

Deploy the previous release tag. Its `landing-<vX.Y.Z>` image must exist.

```bash
./deploy.sh deploy <previous vX.Y.Z> hosti.kubaszwajka.com
```

Swarm also rolls a failed update back by itself (`failureAction: rollback`).

## Cutover from Dokploy

1. Deploy to `hosti-next.kubaszwajka.com`. Check
   `https://hosti-next.kubaszwajka.com/healthz` returns the release commit.
2. Deploy the same version to `hosti.kubaszwajka.com`. This moves the routers
   to the production host and removes the `hosti-next` record.
3. In Dokploy, remove the domain from the landing app, then stop the app.
   Until then two Traefik routers match `hosti.kubaszwajka.com`, and Traefik
   may send a request to either one.
4. Check `https://hosti.kubaszwajka.com/healthz` again.

To undo the cutover, start the Dokploy landing app with its domain again,
then deploy this stack back to `hosti-next.kubaszwajka.com`.

## State

`deploy.sh` links `.alchemy/state` to `~/.local/share/alchemy/state` (mode
`0700`). It refuses a link that points anywhere else, and a real directory.
State stays outside the repo. Git ignores `.alchemy/`. Stack name
`hosti-landing` keeps this state apart from the other stacks in that root.
