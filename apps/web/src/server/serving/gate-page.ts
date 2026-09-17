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
 * gate that never flashes unstyled. The token values and the card shape mirror
 * `src/styles/hosti.css` and `forms.css`, so this gate and the owner's own
 * login are recognisably the same object. Change one, change the other.
 *
 * The mark is copied in as literal SVG for the same reason: a route handler
 * cannot render a React component. Its numbers come from `_ui/mark.tsx`.
 */

export type GateFault = "wrong" | "locked" | "unavailable";

const FAULTS: Record<GateFault, string> = {
  wrong: "That pin is wrong. Check it and try again.",
  locked: "Too many wrong pins. This link is shut for a while.",
  unavailable: "This server cannot open protected links yet.",
};

/** The Hosti mark, same 32 grid and same numbers as `app/_ui/mark.tsx`. */
const MARK = `<svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true">\
<rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="4"/>\
<rect x="12" y="12" width="16" height="16" rx="3" stroke="#06707e" stroke-width="4"/>\
<rect x="18" y="10" width="4" height="4" fill="currentColor"/></svg>`;

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
  --muted: #61686a;
  --line: #c9cfd0;
  --line-soft: #dde3e4;
  --pop: #06707e;
  --danger: #8a2b14;
  --font-serif: Fraunces, Superclarendon, "Bookman Old Style", Georgia, serif;
  --font-sans: "Instrument Sans", ui-sans-serif, system-ui, "Helvetica Neue", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
::selection { background: #bfe0e3; color: var(--ink); }
input { caret-color: var(--pop); }
:focus-visible { outline: 2px solid var(--pop); outline-offset: 2px; }
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
.shell { width: 100%; max-width: 380px; }
.gate {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 30px 30px 26px;
  text-align: center;
}
.gate .mark { display: flex; justify-content: center; margin-bottom: 15px; color: var(--ink); }
.gate h1 {
  font-family: var(--font-serif);
  font-weight: 900;
  font-size: 22px;
  letter-spacing: -0.02em;
  margin: 0 0 7px;
}
.gate .path {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--pop);
  margin: 0 0 22px;
  word-break: break-all;
}
.gate label {
  display: block;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 10px;
}
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
.gate .err { margin: 9px 0 0; font-size: 13px; line-height: 1.35; color: var(--danger); min-height: 18px; }
.gate .go {
  margin-top: 9px;
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
.gate .note {
  margin: 18px 0 0;
  padding-top: 15px;
  border-top: 1px solid var(--line-soft);
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.45;
  text-align: left;
}
.gate .note .mono { font-family: var(--font-mono); font-size: 12px; word-break: break-all; }
.by {
  margin: 15px 0 0;
  text-align: center;
  font-family: var(--font-serif);
  font-weight: 900;
  font-size: 13px;
  letter-spacing: -0.01em;
  color: #7a8385;
}
@media (max-width: 480px) {
  .gate { padding: 26px 22px 24px; }
  .gate input { font-size: 22px; letter-spacing: 0.35em; text-indent: 0.35em; }
}
`.trim();

/**
 * One page, one field, one button, one error line.
 *
 * `sharePath` is the host and prefix the guest already typed, echoed back so
 * they can see they are at the right link. `next` is where they land once the
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
    <div class="shell">
      <form class="gate"${state} method="post" action="${escapeHtml(input.sharePrefix)}/unlock">
      <span class="mark">${MARK}</span>
      <h1>This link is protected</h1>
      <p class="path">${escapeHtml(input.sharePath)}</p>
      <input type="hidden" name="next" value="${escapeHtml(input.next)}" />
      <label for="pin">The pin you were sent</label>
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
      <p class="by">hosti</p>
    </div>
  </body>
</html>
`;
}
