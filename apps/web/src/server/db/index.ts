import type { Database } from "better-sqlite3";
import { runCatalogSync } from "@/server/runtime";

export function db(): Database {
  return runCatalogSync((catalog) => catalog.database);
}

export function nowIso(): string {
  return runCatalogSync((catalog) => catalog.nowIso);
}
