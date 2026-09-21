import { CopyButton } from "@/app/_ui/copy-button";
import { TOKEN_NAME_MAX_LENGTH, TOKEN_NAME_RULE } from "@/server/push-tokens";

/**
 * The one panel that gets an agent pushing to this box. It is the whole of the
 * empty catalog, and it sits at the top of `/tokens` so the owner can come
 * back to it once the catalog has bundles in it.
 *
 * Everything the owner has to carry elsewhere is monospace with a copy button
 * beside it. Nothing here asks them to open a shell on the server.
 */

/** Stands in for the secret until one is minted, so the prompt copies whole. */
export const TOKEN_MARKER = "paste-your-push-token";

/**
 * The command that installs the skill into an agent on another machine.
 *
 * It names the public repository, not this instance. The skill is a file at
 * `skills/hosti-publish/SKILL.md` in the Hosti source, so it is the same text
 * for every instance and Hosti serves nothing to install it. The
 * instance-specific values live in the prompt below, where the real URL and
 * the minted token belong.
 */
export const SKILL_INSTALL_COMMAND = "npx skills add JakubSzwajka/hosti";

/**
 * The prompt the owner hands their agent. The wording is fixed; only the
 * instance URL and the token change. It names the skill install first,
 * because that is what teaches the agent the API this prompt does not.
 */
export function agentPrompt(baseUrl: string, token: string | null): string {
  const url = baseUrl.replace(/\/+$/, "");
  return `Publish a static site to my Hosti catalog.

Hosti is a self-hosted catalog for static bundles. A bundle is a folder of
files with an index.html at its root. It gets a URL.

  HOSTI_URL=${url}
  HOSTI_TOKEN=${token ?? TOKEN_MARKER}

First install the skill, which tells you how to push and share:

  ${SKILL_INSTALL_COMMAND}

Then publish the folder I point you at. It lands private. Give me back the
admin URL, and ask before you open it to anyone.
`;
}

export function OnboardingPanel({
  baseUrl,
  token,
  secret,
  nameRefused,
  heading,
}: {
  baseUrl: string;
  /** The mutation token, which every catalog write carries. */
  token: string;
  /** A freshly minted secret, readable this once, or null. */
  secret: string | null;
  nameRefused: boolean;
  heading: string;
}) {
  const prompt = agentPrompt(baseUrl, secret);
  const install = SKILL_INSTALL_COMMAND;

  return (
    <section className="onboard" aria-labelledby="onboard-head">
      <h2 id="onboard-head">{heading}</h2>
      <p className="empty-lead">
        A bundle is a folder of static files with an <span className="mono">index.html</span> at its
        root. Hosti gives it a URL. An agent needs two things to push one: this address, and a push
        token.
      </p>

      <ol className="steps">
        <li>
          <h3>Mint a push token</h3>
          {secret ? <MintedSecret secret={secret} /> : null}
          <p>
            It is the only secret an agent ever holds. Hosti keeps the digest, so the value is
            readable once and never again.
          </p>
          {nameRefused ? <p className="onboard-error">{TOKEN_NAME_RULE}.</p> : null}
          <form className="mint-form" method="post" action="/tokens/mint">
            <input type="hidden" name="token" value={token} />
            <input
              name="name"
              defaultValue=""
              maxLength={TOKEN_NAME_MAX_LENGTH}
              autoComplete="off"
              placeholder="laptop"
              aria-label="name for the new push token"
              required
            />
            <button className="btn" type="submit">
              mint a token
            </button>
          </form>
        </li>

        <li>
          <h3>Hand your agent this prompt</h3>
          <p>
            {secret
              ? "The token above is already in it. Paste it into the agent and point it at a folder."
              : "Mint a token first, or paste the value into the HOSTI_TOKEN line yourself."}
          </p>
          <pre>{prompt}</pre>
          <div className="onboard-acts">
            <CopyButton value={prompt} label="copy the prompt" tone="go" />
          </div>
        </li>

        <li>
          <h3>Or install the skill on its own</h3>
          <p>
            The prompt installs it too. Run this where the agent works if you would rather do it by
            hand.
          </p>
          <pre>{install}</pre>
          <div className="onboard-acts">
            <CopyButton value={install} label="copy the command" />
          </div>
        </li>
      </ol>
    </section>
  );
}

/**
 * The one moment a secret is readable. It is held in memory by the mint and
 * taken away by this read, so a reload shows the panel with nothing here.
 */
function MintedSecret({ secret }: { secret: string }) {
  return (
    <div className="minted">
      <p className="minted-head">
        <span>your new push token</span>
        <span className="minted-once">shown once</span>
      </p>
      <p className="minted-secret mono">{secret}</p>
      <div className="onboard-acts">
        <CopyButton value={secret} label="copy the token" />
      </div>
    </div>
  );
}
