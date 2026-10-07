import type { GateFault, GatePageInput } from "@hosti/serving";
import { runServingSync } from "@/server/runtime";

export type { GateFault };

export function gatePageHtml(input: GatePageInput): string {
  return runServingSync((serving) => serving.gatePageHtml(input));
}
