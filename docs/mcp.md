# MCP setup

Hosti serves Streamable HTTP MCP at `/mcp`. Clerk OAuth authenticates the owner.
Push tokens and owner cookies do not unlock MCP. Existing API and CLI routes do not change.

## Runtime configuration

Set these values in the Dokploy Hosti application's environment.
The `web.environment` block in `docker-compose.yml` forwards them into the container.

| Variable | Value |
| --- | --- |
| `HOSTI_MCP_URL` | `https://hosti-private.kubaszwajka.com/mcp` |
| `CLERK_ISSUER` | `https://diverse-peacock-3117.clerk.accounts.dev` |
| `HOSTI_OWNER_CLERK_USER_ID` | `user_3MdlecctrCTuI16pwtIowDHOBsu` |
| `HOSTI_MCP_DELETE_CLIENT_IDS` | Empty by default |

Keep existing `HOSTI_SECRET`, `HOSTI_PUBLIC_URL`, data and owner password settings.
Missing MCP configuration disables MCP without changing the existing API or catalog.
No Clerk key, publishable key or OAuth client secret is needed.
Hosti fetches the issuer's public JWKS and accepts RS256 only.

Clerk setup is complete. JWT access tokens and the audience claim are enabled.
PKCE is required. Production OpenBot sign-in and transfer proof remain Majster's work after release.

## Discovery and scopes

Public metadata is available at `/.well-known/oauth-protected-resource` and
`/.well-known/oauth-protected-resource/mcp`. Both advertise the exact configured resource,
Clerk issuer, header bearer method and `email` scope. Metadata allows cross-origin reads.

Every MCP request needs a signed JWT with the exact issuer and audience, numeric expiry,
nonempty subject and `client_id`, and the `email` scope.
Only the configured owner's subject is admitted. Web sessions and delegation claims are refused.
Expiry has five seconds of tolerance. Invalid credentials receive 401 and a metadata challenge.
A valid other subject or missing email scope receives 403.
Foreign Origin headers are refused. Native clients without Origin are allowed.

Every admitted OAuth client has Hosti's `publish` and `share` scopes.
Only signed `client_id` values in `HOSTI_MCP_DELETE_CLIENT_IDS` have `delete`.
Separate client IDs with commas. There are no custom Clerk scopes.
A tool annotation or confirmation never grants a scope.

Sessions bind the verified subject and client ID. They expire after 30 minutes.
A restart requires MCP initialization again, but transfer grants survive.
Hosti accepts protocol versions 2025-03-26, 2025-06-18 and 2025-11-25.
GET SSE and event resumption are not supported. DELETE ends the authenticated session.
Requests are limited to 64 KiB and 15 seconds. At most 128 MCP sessions remain active.

## Tools

| Tool | Arguments and result |
| --- | --- |
| `list_bundles` | Optional `collection`, `offset`, `limit`. Limit defaults to 50, maximum 100. Returns `nextOffset`. |
| `get_bundle` | `slug`. Returns metadata, kept revisions, sharing, attribution and URLs. |
| `push` | `slug`, optional `title` and `collection`. Returns an upload grant, not a revision. |
| `get_download_link` | `slug`, optional positive `revision` or `"current"`. Returns an exact-revision download grant. |
| `set_sharing` | `slug`, `mode`, optional owner-supplied `pin`. Uses existing pin rules. |
| `rotate_link` | `slug`. Changes the share link, not the mode or pin. |
| `prune` | `slug`. Uses `HOSTI_KEEP_REVISIONS`, never deletes current. |
| `delete_bundle` | `slug`, `confirm` equal to that slug. Also requires delete scope. |

A collection filter of `null` selects bundles without a collection.
Titles are limited to 200 characters. Existing slug and collection rules apply.
A push never changes sharing. Hosti never returns a pin or pin hash.

Share links, admin links and upload-result links use `HOSTI_PUBLIC_URL`.
Without that setting, they use the request origin, as existing API routes do.
Capability links always use the configured `HOSTI_MCP_URL` origin.

Each MCP revision records `mcp:<client-name>` in `pushedBy`.
Hosti normalizes the initialization name, removes controls and caps it at 80 Unicode codepoints.
This is declared attribution, not an authenticated bot identity.
One shared OpenBot name cannot identify individual bots.
Hosti stores verified subject and client ID separately in transfer state.

## Archive transfers

MCP carries metadata only. Use curl without Authorization headers for archive bytes:

```text
push -> PUT /api/mcp/uploads/<id>?sig=<capability> -> revision
get_download_link -> GET /api/mcp/downloads/<id>?sig=<capability> -> tar.gz
```

Keep grant URLs private. Do not log their query strings or send them to another person.
Configure reverse proxies and tracing to omit transfer query strings.
Next development request logging omits MCP paths.
Auth and transfer responses use no-store.

Grants last ten minutes. HMAC signatures bind purpose, HTTP method and ID using `HOSTI_SECRET`.
Changing that secret revokes existing grants.
State lives under `HOSTI_DATA_DIR/mcp-transfers`, outside served bundles.
It contains no bearer tokens, push tokens, pins or signatures.
Keep this directory on the same persistent volume as the catalog.
Expired state is cleaned when a new grant is issued.
The outstanding-grant check counts shared files, including consumed uploads until expiry.
Each process serializes its own allocations and refuses issuance at 256 grants.
The allocation lock is not shared between processes.
With N overlapping processes, simultaneous allocation can exceed 256 by up to N-1 grants.

An upload atomically reserves its persistent single-use marker before reading the archive.
Concurrent replay and restart replay cannot create another revision.
A failed or interrupted upload consumes its grant. Request a new grant to retry.
Upload processing times out after 120 seconds. Limits match the API:
50 MiB compressed, 2,000 files and 20 MiB per file.
Archive bytes stream through the existing validation and storage.
An invalid archive never becomes current. PUT cannot change the grant's metadata or attribution.

Downloads are reusable until expiry. Current is fixed when the grant is issued.
A grant binds the directory device, inode and nanosecond birth time observed at issue.
The catalog must still contain that revision when the grant is used.
Before streaming, Hosti compares that generation with the opened directory handle.
Pruning or deleting a revision revokes its download grants.
Recreating the same slug and sequence cannot expose replacement bytes, even with an older writer.
No revision sidecar is read or written. Legacy writes never need MCP metadata storage.
Grants from the sidecar-based implementation fail closed after this change.
Linux `/proc/self/fd` keeps archive streaming tied to the checked directory.
MCP downloads require Linux and filesystem support for nonzero directory birth times.
Missing generation information fails closed; macOS MCP downloads are not supported.
Downloads do not change sharing or retention.
Responses are attachments with no-store, nosniff and no-referrer.

## Transport boundary and limits

Effect MCP runs a transport-only HTTP handler for each session in delivery.
This is the approved exception to the delivery rule against running Effects.
It hosts protocol state and tool dispatch, not domain services.
Tools cross `app/_http/run-use-case.ts` into the single domain ManagedRuntime.
There is no second domain runtime and no internal HTTP or CLI hop.
Transfer service methods capture their filesystem, path and crypto dependencies.

Discovery supports simple cross-origin GET requests, not custom-header browser preflights.
Missing email scope returns 403 without a step-up scope challenge.
The bearer scheme requires `Bearer ` with that exact case.
The 15-second MCP body timeout currently returns 413, like the byte limit.
Titles keep the existing text policy; the 200-character cap does not remove controls.
These limits do not change the native-client flow.

## Local proof and production handoff

Run `pnpm build`, then `node apps/web/scripts/mcp-proof.mjs`.
The runner starts an isolated real Next server on an unused port and a local JWKS issuer.
It signs synthetic JWTs and uses actual curl PUT and GET without printing grants or credentials.
It verifies nested and binary file hashes, sharing, replay, restart persistence, retention and delete scope.
The pin check sends `Accept: text/html` and requires the HTML gate form.
Locked `*/*` requests and assets must still return 404.
The runner also observes wrong transfer methods and tampered signatures before valid use.
It kills only its own server during a reserved upload and proves that replay stays refused.
It removes only its own temporary data and stops only its own processes.
See [the proof setup skill](../.agents/skills/prove-setup/SKILL.md) for the exact evidence command and CLI setup.

This implementation requires no database migration.
Do not deploy or change production during local proof.

Majster must use the existing normal Dokploy release path or a rolling/start-first deployment.
Zero downtime is required. Run a continuous health probe before, during and after deployment.
Record every failed probe and verify uninterrupted service before accepting the release.
Run this in a separate terminal until deployment and post-deployment checks finish:

```bash
while true; do
  printf '%s ' "$(date -u +%FT%TZ)"
  curl --silent --show-error --fail --max-time 3 \
    --output /dev/null --write-out '%{http_code}\n' \
    https://hosti-private.kubaszwajka.com/api/health || printf 'FAILED\n'
  sleep 1
done
```

Stop the probe with Ctrl-C and keep its transcript.
Do not replace a running instance with a stop-first manual restart.
Before release, Majster must check one real Clerk OAuth access token without retaining its clear value.
Confirm string `aud` equals the exact resource, no `sid` or delegation claim exists, and `email` is present.
Do not loosen RS256, audience or session-credential checks without a separate policy decision.
After release, Majster must prove real Clerk/OpenBot OAuth and curl transfer on deployed Hosti.
Local signed-JWT proof does not prove Clerk's login UI or OpenBot compatibility.
