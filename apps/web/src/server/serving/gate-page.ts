/**
 * The PIN gate: Hosti's own page, served at the guest's own URL.
 *
 * It must leak nothing. No bundle title, no collection, no revision, no hint
 * that the slug is real, beyond the unavoidable fact that a gate appeared. An
 * unknown link answers 404 and a protected link answers this, and those are the
 * only two things a stranger can tell apart.
 *
 * The CSS is inline because a route handler cannot pull a stylesheet through
 * Next's pipeline, and because a gate that renders before a second request is a
 * gate that never flashes unstyled. The token values mirror
 * `src/styles/hosti.css`; the layout is the `gate` card from the chosen
 * prototype, bare variant, so there is no top bar.
 */

export type GateFault = "wrong" | "locked" | "unavailable";

const FAULTS: Record<GateFault, string> = {
  wrong: "That pin is wrong. Check it and try again.",
  locked: "Too many wrong pins. This link is shut for a while.",
  unavailable: "This server cannot open protected links yet.",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLE = `
:root {
  --paper: #ecf2f3;
  --card: #f8fdff;
  --ink: #2b3133;
  --muted: #696f70;
  --line: #c9cfd0;
  --pop: #06707e;
  --danger: #a3341a;
  --font-serif: Fraunces, Superclarendon, "Bookman Old Style", Georgia, serif;
  --font-sans: "Instrument Sans", ui-sans-serif, system-ui, "Helvetica Neue", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  background-color: var(--paper);
  background-image: radial-gradient(circle at 1px 1px, rgba(43, 49, 51, 0.08) 1px, transparent 0);
  background-size: 22px 22px;
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.5;
}
.gate {
  width: 100%;
  max-width: 380px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 34px 32px 28px;
  text-align: center;
}
.gate h1 {
  font-family: var(--font-serif);
  font-weight: 900;
  font-size: 24px;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
}
.gate .path {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--pop);
  margin: 0 0 22px;
  word-break: break-all;
}
.gate label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 9px; }
.gate input {
  font-family: var(--font-mono);
  font-size: 26px;
  letter-spacing: 0.5em;
  text-indent: 0.5em;
  text-align: center;
  width: 100%;
  padding: 12px 0;
  color: var(--ink);
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  outline: none;
}
.gate input:focus { border-color: var(--pop); box-shadow: 0 0 0 3px rgba(6, 112, 126, 0.14); }
.gate[data-state="wrong"] input,
.gate[data-state="locked"] input { border-color: var(--danger); background: #fff6f4; }
.gate .err { margin: 10px 0 0; font-size: 13px; color: var(--danger); min-height: 19px; }
.gate .go {
  margin-top: 18px;
  width: 100%;
  padding: 11px 0;
  background: var(--ink);
  color: #f4f8f9;
  border: 0;
  border-radius: 8px;
  font: inherit;
  font-size: 14.5px;
  cursor: pointer;
}
.gate .go:hover { background: #151b1d; }
.gate .note { margin: 18px 0 0; font-size: 12.5px; color: var(--muted); line-height: 1.45; }
.gate .note .mono { font-family: var(--font-mono); font-size: 12px; }
.mark {
  position: fixed;
  right: 14px;
  bottom: 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: #9aa3a5;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(201, 207, 208, 0.8);
  border-radius: 999px;
  padding: 2px 9px;
}
@media (max-width: 480px) {
  .gate { padding: 28px 22px 24px; }
  .gate input { font-size: 22px; letter-spacing: 0.35em; text-indent: 0.35em; }
}
`.trim();

/**
 * One page, one field, one button, one error line.
 *
 * `sharePath` is the host and prefix the guest already typed, echoed back so
 * they can see they are at the right door. `next` is where they land once the
 * PIN is right; the caller has already checked it sits under this share link.
 */
export function gatePageHtml(input: {
  sharePath: string;
  sharePrefix: string;
  next: string;
  fault?: GateFault;
}): string {
  const fault = input.fault;
  const message = fault ? FAULTS[fault] : "";
  const state = fault ? ` data-state="${fault}"` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Protected link</title>
    <style>${STYLE}</style>
  </head>
  <body>
    <form class="gate"${state} method="post" action="${escapeHtml(input.sharePrefix)}/unlock">
      <h1>This link is protected</h1>
      <p class="path">${escapeHtml(input.sharePath)}</p>
      <input type="hidden" name="next" value="${escapeHtml(input.next)}" />
      <label for="pin">Type the pin you were sent</label>
      <input
        id="pin"
        name="pin"
        type="password"
        inputmode="numeric"
        autocomplete="off"
        maxlength="8"
        autofocus
      />
      <p class="err">${escapeHtml(message)}</p>
      <button class="go" type="submit">Open the bundle</button>
      <p class="note">
        The pin sits on the share link, not on the bundle. Getting it right opens
        <span class="mono">${escapeHtml(input.sharePrefix)}</span> and nothing else.
      </p>
    </form>
    <span class="mark">hosti</span>
  </body>
</html>
`;
}
