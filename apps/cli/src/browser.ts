import { spawn } from "node:child_process";
import type { Writer } from "./output.ts";

/** The command each platform uses to hand a URL to whatever opens URLs. */
function opener(): { command: string; args: string[] } {
  if (process.platform === "darwin") return { command: "open", args: [] };
  if (process.platform === "win32") return { command: "cmd", args: ["/c", "start", ""] };
  return { command: "xdg-open", args: [] };
}

/**
 * Hand a URL to the platform's browser. It is let go of straight away, so the
 * CLI exits without waiting for a window, and a box with no opener says so on
 * stderr rather than failing the command: the URL is already printed.
 */
export function openInBrowser(url: string, warn: Writer): void {
  const { command, args } = opener();
  try {
    const child = spawn(command, [...args, url], { stdio: "ignore", detached: true });
    child.on("error", () => warn(`Could not run ${command}; the URL is above`));
    child.unref();
  } catch {
    warn(`Could not run ${command}; the URL is above`);
  }
}
