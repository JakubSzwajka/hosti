import { spawn } from "node:child_process";
import type { Writer } from "./output.ts";

function opener(): { command: string; args: string[] } {
  if (process.platform === "darwin") return { command: "open", args: [] };
  if (process.platform === "win32") return { command: "cmd", args: ["/c", "start", ""] };
  return { command: "xdg-open", args: [] };
}

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
