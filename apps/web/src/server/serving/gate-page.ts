import type { GateFault } from "@hosti/serving";
import { runServingSync } from "@/server/runtime";

export type { GateFault };

export function gatePageHtml(input: {
  sharePath: string;
  sharePrefix: string;
  next: string;
  fault?: GateFault;
}): string {
  return runServingSync((serving) => serving.gatePageHtml(input));
}
