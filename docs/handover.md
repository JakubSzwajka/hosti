# Single-writer handover

Hosti can run as a reader while another process owns the data volume. This contract protects one volume. It does not prove a live platform cutover, ingress routing, or zero downtime.

## Process startup and ownership

The production image starts the generated Next server with the private-channel preload:

```text
node --import ./scripts/private-channel-preload.mjs server.js
```

The Dockerfile sets `/app/apps/web` as the working directory. The preload wraps Node's HTTP server. Do not replace the image command with `next dev`, `next start`, or the unwrapped standalone server. Those processes do not install the private channel, so the internal hooks return 404.

`SMALL_APP_WRITER_EPOCH` is optional. It is an opaque value of 1 to 200 printable ASCII characters with no spaces. The receiver supplies it to a candidate at startup. An unset or empty value means unmanaged mode, used by the current Compose setup. An invalid value prevents writer promotion.

Hosti stores writer state in `HOSTI_DATA_DIR`, which defaults to `/data` in the image:

| File | Purpose |
| --- | --- |
| `hosti-writer.lease` | SQLite file whose exclusive lock grants one process write ownership. |
| `hosti-writer.json` | Atomically written `{version:1,owner,fence,spent[]}` handover state. |

The lease uses SQLite exclusive locking. The process holds it until fencing closes the writable database and releases the lease, or the process exits. There is no timeout or automatic stale-lease takeover. Never remove or replace either file to recover a lock.

An absent state file means an unmanaged volume. A malformed state file leaves the process read-only. Readiness reports `ready: false`, and fence requests fail with `state_invalid`.

On first catalog access, the process opens `hosti.db` read-only. This path does not create or migrate the database, change its journal mode, or repair catalog data. SQLite may create transient `-shm` or `-wal` files. Hosti promotes a process only when its epoch is eligible and it acquires the lease. It re-reads the state while holding the lease, then opens the writable database, runs migrations and repairs, and records the owner. Readers retry promotion on first catalog access and when an operator polls readiness. Health, smoke, ordinary reads, timers, and background jobs do not promote a reader.

A process is eligible when its epoch is not spent and either no fence is active with no different owner, or its epoch matches the active fence. A restarted fenced process remains a reader. A process cannot fence itself with its startup epoch.

## Private control hooks

All five hooks are private, including health. The preload removes any incoming `x-hosti-private-channel` header. It stamps its own unpredictable process secret only when the TCP peer address is loopback: `127.0.0.0/8`, `::1`, or `::ffff:127.x`. Routes compare that secret with a timing-safe check.

The routes do not trust `Host`, forwarded-address headers, or `X-Small-App-Epoch` as proof of private access. Non-private requests receive Hosti's normal 404 page. A public release poll or ingress-container probe cannot call these hooks under the current channel rule.

| Method and path | Result |
| --- | --- |
| `GET /api/health` | HTTP 200 with `{status:"ok",commit}`. Also works on a fenced reader. |
| `GET /internal/deploy/ready` | HTTP 200 with `{ready,writer,schema,epoch}`. `schema` is a string. Polling may promote an eligible reader. |
| `GET /internal/deploy/smoke` | HTTP 200 with `{ok:true,writer,schema,bundles}` after a read. It does not promote, migrate, or update token state. |
| `POST /internal/deploy/fence/on` | Fence and drain the current writer. |
| `POST /internal/deploy/fence/off` | Transfer ownership back to this process. |

Use the receiver's container-loopback call for a hook. For example:

```sh
docker exec "$CONTAINER" node -e '
  fetch("http://localhost:3000/internal/deploy/ready")
    .then(async (response) => {
      process.stdout.write(`${response.status} ${await response.text()}\n`);
      if (!response.ok) process.exitCode = 1;
    })
    .catch(() => process.exit(1));
'
```

The receiver calls the service at `http://localhost:3000` from inside the container and must not follow redirects. Do not publish the internal routes or use a public proxy to reach them.

## Fence and transfer

Both POST hooks require the same epoch in the `X-Small-App-Epoch` header and the JSON body. The body must contain only `epoch`.

```http
POST /internal/deploy/fence/on
X-Small-App-Epoch: <attempt-epoch>
Content-Type: application/json

{"epoch":"<attempt-epoch>"}
```

Fence-on first denies new writes. It persists the fence, waits for admitted writes to finish, closes the writable database, releases the lease, then reopens read-only. It returns HTTP 200 with `{fenced:true,drained:true,epoch}` only after that sequence completes. A same-epoch retry is idempotent and waits for an in-progress drain.

Fence-off accepts the active fence epoch or the recorded owner epoch when another process owns the volume. It acquires the lease before opening the writable database. It then records this process as owner, clears the fence and adds the supplied epoch to `spent`. A retry returns HTTP 200. If it arrives while this process is draining, it cancels the fence; the pending fence-on returns `fence_cancelled`.

A spent epoch cannot fence again. Stale epochs, an epoch owned by the current process, another active fence, and attempts by a non-writer return HTTP 409. If the lease is busy during fence-off, Hosti returns `lease_busy`. Do not retry with a new epoch to bypass a refusal. Resolve ownership from the current durable state first.

## Writes and reads while fenced

When a process is not the writer or is draining, every mutation returns HTTP 503 with `Retry-After: 5`, `Cache-Control: no-store`, and `{error:"writer_paused",message}`. This includes API and browser uploads, upload finalization, revision pushes, pruning, sharing changes, deletes, agent authorization, login submission, pin unlock throttling, token revocation, and mutating MCP tools.

MCP list and bundle reads remain available. Other reads remain available, including catalog pages, bundle serving, previews, archive GETs, MCP downloads, `whoami`, agent-authorization polling, and logout. Push-token `last_used_at` bookkeeping runs only on the writer. Stateless preview signatures and logout cookie clearing remain available because they do not mutate shared state.

`pnpm token:new` and `node scripts/new-token.mjs` also acquire the writer lease. They refuse while a Hosti process owns that data directory or while a fence is active. Do not use them to bypass a running writer. Use `hosti login` on a running writer, or stop every Hosti process that uses the data directory before running token creation.

## Migration and rollback compatibility

This change does not alter the SQLite schema. The writer sidecar carries handover state, and the schema remains version 4. Readers do not migrate.

Future migrations and writes must remain readable by the previous version. Prefer additive schema changes. Keep fields and stored values that the previous version reads. Test the actual previous-version reader against the migrated schema and representative writes from the new version. Do not generate that reader fixture from the current schema. If the previous version cannot read the schema and every new write, automatic handover is blocked until a separately reviewed compatibility plan exists.

Do not restore an older backup over writes made by the new writer. Compatibility failure, uncertain process exit, a busy lease, or malformed durable state means stop and keep writes denied until an operator resolves ownership.

## Activation blockers and proof limits

The private-only hook rule currently conflicts with existing platform probes. The public poll in `.github/workflows/release-create.yml` receives 404 from `/api/health`. The PR73 ingress-container probes use a non-loopback peer and also receive 404. The public health curl described in `docs/mcp.md` has the same limitation. Do not change those workflows or infer that this implementation has completed platform integration. Resolve and review the probe-channel conflict before activation.

The local image proof does not test the live receiver, deployment journal, route switch, ingress acknowledgement, backup adapter, or a real volume cutover. It does not establish zero downtime. Follow the isolated procedure in [the proof setup skill](../.agents/skills/prove-setup/SKILL.md).