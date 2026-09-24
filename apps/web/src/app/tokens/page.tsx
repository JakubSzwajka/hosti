import { headers } from "next/headers";
import Link from "next/link";
import { formatDate, plural } from "@/app/_ui/format";
import { OnboardingPanel } from "@/app/_ui/onboarding-panel";
import { Masthead } from "@/app/_ui/pieces";
import type { PushTokenRecord } from "@hosti/identity";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { requireAdmin } from "@/server/auth/admin";
import { baseUrlFromHeaders } from "@/server/config";
import { listTokens } from "@/use-cases/list-tokens";
import { takeMintedSecret } from "@/use-cases/take-minted-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PushTokens({
  searchParams,
}: {
  searchParams: Promise<{ shown?: string; token?: string }>;
}) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const secret = await runAppUseCase(takeMintedSecret(query.shown));
  const baseUrl = baseUrlFromHeaders(await headers());
  const tokens = await runAppUseCase(listTokens());

  return (
    <div className="wrap catalog-shell">
      <Masthead
        meta={
          <span className="mast-meta">
            <Link href="/">the catalog</Link>
          </span>
        }
        token={admin.mutationToken}
      />
      <div className="register-line">
        <span>push tokens</span>
        <span>{plural(tokens.length, "token")}</span>
      </div>

      <div className="tokens-page">
        <div className="empty onboard-shell">
          <OnboardingPanel
            baseUrl={baseUrl}
            token={admin.mutationToken}
            secret={secret}
            nameRefused={query.token === "bad_token_name"}
            heading="Point an agent at this box"
          />
        </div>

        <TokenList
          tokens={tokens}
          token={admin.mutationToken}
          badId={query.token === "bad_token_id"}
        />
      </div>
    </div>
  );
}

function TokenList({
  tokens,
  token,
  badId,
}: {
  tokens: PushTokenRecord[];
  token: string;
  badId: boolean;
}) {
  return (
    <section className="token-list" aria-labelledby="token-list-head">
      <h2 id="token-list-head">Tokens that already exist</h2>
      {badId ? <p className="onboard-error">That is not a token this catalog holds.</p> : null}
      {tokens.length === 0 ? (
        <p className="token-none">None yet. The first one is minted above.</p>
      ) : (
        <ul>
          {tokens.map((record) => (
            <li key={record.id}>
              <div className="token-name">
                <span>{record.name}</span>
                <span className="token-when">
                  minted {formatDate(record.createdAt)}
                  {record.lastUsedAt
                    ? `, last pushed ${formatDate(record.lastUsedAt)}`
                    : ", unused"}
                </span>
              </div>
              <form method="post" action="/tokens/revoke">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="id" value={String(record.id)} />
                <button className="btn" type="submit" data-tone="danger">
                  revoke
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p className="token-note">
        Revoking stops that secret opening the API from the next request on. Revisions it already
        pushed keep its name: they record what happened, not what is still allowed.
      </p>
    </section>
  );
}
