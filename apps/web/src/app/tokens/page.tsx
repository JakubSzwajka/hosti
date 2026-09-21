import { headers } from "next/headers";
import Link from "next/link";
import { formatDate, plural } from "@/app/_ui/format";
import { OnboardingPanel } from "@/app/_ui/onboarding-panel";
import { Masthead } from "@/app/_ui/pieces";
import { requireAdmin } from "@/server/auth/admin";
import { baseUrlFromHeaders } from "@/server/config";
import { takeMintedSecret } from "@/server/minted-secret";
import { listPushTokens, type PushTokenRecord } from "@/server/push-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Push tokens: the onboarding panel the empty catalog shows, plus every token
 * that already exists and a revoke on each.
 *
 * It needs the admin session, like every other catalog page. A push token
 * opens `/api/v1/` and cannot reach here, which is the point: a token that
 * could mint another token would never be revocable.
 *
 * `?shown=<id>` is a mint redirect coming back. The secret is read out of the
 * one-time store and the store forgets it, so a reload shows the page with
 * nothing to copy. That is the correct failure.
 */
export default async function PushTokens({
  searchParams,
}: {
  searchParams: Promise<{ shown?: string; token?: string }>;
}) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const secret = takeMintedSecret(query.shown);
  const baseUrl = baseUrlFromHeaders(await headers());
  const tokens = listPushTokens();

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
