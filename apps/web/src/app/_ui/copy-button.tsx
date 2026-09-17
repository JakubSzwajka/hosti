"use client";

import { useState } from "react";

/**
 * Copies the absolute share URL. The clipboard API needs a secure context,
 * which localhost counts as; the textarea fallback covers a plain-http box on
 * a LAN, where the owner would otherwise have no copy at all.
 */
export function CopyButton({ value }: { value: string }) {
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
    <button className="btn" type="button" onClick={copy} {...(copied ? { "data-copied": "" } : {})}>
      {copied ? "copied" : "copy link"}
    </button>
  );
}
