import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (process.env.CI || !existsSync(".git")) process.exit(0);
const result = spawnSync("npx", ["lefthook", "install"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
