"use client";

import { useState } from "react";

/**
 * Copies a value the owner would otherwise retype: a share URL, an agent
 * prompt, an install command. The clipboard API needs a secure context, which
 * localhost counts as; the textarea fallback covers a plain-http box on a LAN,
 * where the owner would otherwise have no copy at all.
 *
 * `tone` is the button family's own, so the one copy that is the next action
 * on a screen can be the filled control without a second component.
 */
export function CopyButton({
  value,
  label = "copy link",
  tone,
}: {
  value: string;
  label?: string;
  tone?: "go" | "danger";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      className="btn"
      type="button"
      onClick={copy}
      {...(tone ? { "data-tone": tone } : {})}
      {...(copied ? { "data-copied": "" } : {})}
    >
      {copied ? "copied" : label}
    </button>
  );
}
