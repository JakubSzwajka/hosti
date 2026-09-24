import { runServingSync } from "@/server/runtime";

export function contentTypeFor(filePath: string): string {
  return runServingSync((serving) => serving.contentTypeFor(filePath));
}
