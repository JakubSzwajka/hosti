"use client";

import { useState } from "react";

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
