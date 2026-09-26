import type { AgentConnectionView } from "@hosti/identity";
import type { PushScope } from "@hosti/shared";
import Link from "next/link";
import { connectPath } from "@/app/_http/return-path";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { Mark } from "@/app/_ui/mark";
import { SCOPE_MEANING } from "@/app/_ui/scopes";
import { requireAdmin } from "@/server/auth/admin";
import { showAgentConnection } from "@/use-cases/show-agent-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Connect an agent · Hosti" };

export default async function ConnectAgent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  // next.config.ts answers /connect with frame-ancestors 'none', so no page can frame Approve.
  const path = connectPath(id);
  const admin = await requireAdmin(path ?? undefined);
  const { error } = await searchParams;
  const connection = path ? await runAppUseCase(showAgentConnection(id)) : null;

  return (
    <main className="gate connect">
      <div className="card">
        <h1>
          <Mark size={21} />
          hosti
        </h1>
        {connection ? (
          <Connection connection={connection} token={admin.mutationToken} error={error} />
        ) : (
          <Result title="No such connection">
            This catalog holds no agent connection at this address. It may have expired, or the
            server may have restarted. Ask the agent to run <code>hosti login</code> again.
          </Result>
        )}
      </div>
      <p className="after">
        <Link href="/tokens">push tokens</Link>
      </p>
    </main>
  );
}

function Connection({
  connection,
  token,
  error,
}: {
  connection: AgentConnectionView;
  token: string;
  error: string | undefined;
}) {
  switch (connection.status) {
    case "approved":
      return (
        <Result title="Agent connected">
          <strong>{connection.tokenName}</strong> can now{" "}
          {(connection.grantedScopes ?? []).join(", ")}. The agent picks up its token on its next
          poll. You can close this tab.
        </Result>
      );
    case "denied":
      return (
        <Result title="Connection denied">
          <strong>{connection.tokenName}</strong> got no push token. The agent stops waiting on its
          next poll.
        </Result>
      );
    case "expired":
      return (
        <Result title="This connection expired">
          Nobody approved it within ten minutes. Ask the agent to run <code>hosti login</code>{" "}
          again.
        </Result>
      );
    case "pending":
      return <Pending connection={connection} token={token} error={error} />;
  }
}

function Pending({
  connection,
  token,
  error,
}: {
  connection: AgentConnectionView;
  token: string;
  error: string | undefined;
}) {
  const asked = (scope: PushScope) => connection.requestedScopes.includes(scope);
  return (
    <>
      <p className="connect-lead">An agent asks for a push token for this catalog.</p>
      <dl className="connect-facts">
        <dt>name</dt>
        <dd>{connection.tokenName}</dd>
        <dt>code</dt>
        <dd className="connect-code">{connection.userCode}</dd>
      </dl>
      <p className="connect-hint">Approve only if this code matches the one the agent printed.</p>
      {error ? (
        <p className="error">That token is already in use. Ask the agent to log in again.</p>
      ) : null}

      <form method="post" action={`/connect/${connection.id}/approve`}>
        <input type="hidden" name="token" value={token} />
        <fieldset className="connect-scopes">
          <legend>it may</legend>
          <ul>
            {(["publish", "share"] as const).filter(asked).map((scope) => (
              <li key={scope}>
                <input type="hidden" name="scope" value={scope} />
                <span className="connect-granted">{scope}</span> {SCOPE_MEANING[scope]}
              </li>
            ))}
            {asked("delete") ? (
              <li>
                <label>
                  <input type="checkbox" name="scope" value="delete" /> <span>delete</span>{" "}
                  {SCOPE_MEANING.delete}
                </label>
              </li>
            ) : null}
          </ul>
        </fieldset>
        <p className="connect-expiry">
          Expires <time dateTime={connection.expiresAt}>{formatExpiry(connection.expiresAt)}</time>.
        </p>
        <button type="submit">Approve</button>
      </form>
      <form method="post" action={`/connect/${connection.id}/deny`} className="connect-deny">
        <input type="hidden" name="token" value={token} />
        <button type="submit">Deny</button>
      </form>
    </>
  );
}

function Result({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="connect-title">{title}</h2>
      <p className="setup">{children}</p>
    </>
  );
}

function formatExpiry(iso: string): string {
  const left = Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));
  const time = iso.slice(11, 16);
  return `at ${time} UTC, in ${left} ${left === 1 ? "minute" : "minutes"}`;
}
