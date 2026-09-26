import { CopyButton } from "@/app/_ui/copy-button";

export const CLI_INSTALL_COMMAND =
  "npm install -g https://github.com/JakubSzwajka/hosti/releases/latest/download/hosti-cli.tgz";

export const SKILL_INSTALL_COMMAND = "npx skills add JakubSzwajka/hosti";

export function loginCommand(baseUrl: string): string {
  return `hosti login ${baseUrl.replace(/\/+$/, "")}`;
}

export function agentPrompt(baseUrl: string): string {
  return `Publish a static site to my Hosti catalog.

Hosti is a self-hosted catalog for static bundles. A bundle is a folder of
files with an index.html at its root. It gets a URL.

First install the Hosti CLI and the skill that tells you how to use it:

  ${CLI_INSTALL_COMMAND}
  ${SKILL_INSTALL_COMMAND}

Then connect to my catalog:

  ${loginCommand(baseUrl)}

It prints a link and a code. Show me both and wait while I approve it in my
browser. Never print the token it saves.

Then publish the folder I point you at. It lands private. Give me back the
admin URL, and ask before you open it to anyone.
`;
}

export function OnboardingPanel({ baseUrl, heading }: { baseUrl: string; heading: string }) {
  const login = loginCommand(baseUrl);
  const prompt = agentPrompt(baseUrl);

  return (
    <section className="onboard" aria-labelledby="onboard-head">
      <h2 id="onboard-head">{heading}</h2>
      <p className="empty-lead">
        A bundle is a folder of static files with an <span className="mono">index.html</span> at its
        root. Hosti gives it a URL. An agent pushes one with the Hosti CLI, once you approve it
        here.
      </p>

      <ol className="steps">
        <li>
          <h3>Install the CLI where the agent works</h3>
          <pre>{CLI_INSTALL_COMMAND}</pre>
          <div className="onboard-acts">
            <CopyButton value={CLI_INSTALL_COMMAND} label="copy the install command" />
          </div>
        </li>

        <li>
          <h3>Log in to this catalog</h3>
          <p>
            It prints a link and a code. Open the link here, check the code matches, and approve.
            The agent never sees your password, and its token never passes through your clipboard.
          </p>
          <pre>{login}</pre>
          <div className="onboard-acts">
            <CopyButton value={login} label="copy the login command" tone="go" />
          </div>
        </li>

        <li>
          <h3>Or hand your agent this prompt</h3>
          <p>It runs both commands itself and asks you to approve. It carries no token.</p>
          <pre>{prompt}</pre>
          <div className="onboard-acts">
            <CopyButton value={prompt} label="copy the prompt" />
          </div>
        </li>

        <li>
          <h3>Install the skill on its own</h3>
          <p>
            The prompt installs it too. Run this where the agent works if you would rather do it by
            hand.
          </p>
          <pre>{SKILL_INSTALL_COMMAND}</pre>
          <div className="onboard-acts">
            <CopyButton value={SKILL_INSTALL_COMMAND} label="copy the command" />
          </div>
        </li>
      </ol>
    </section>
  );
}
