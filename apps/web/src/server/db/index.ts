import type { Database } from "better-sqlite3";
import { databaseFile } from "@/server/config";
import { openDatabase } from "./open.mjs";

type Cache = { file: string; db: Database } | null;

const globalCache = globalThis as typeof globalThis & { __hostiDb?: Cache };

export function db(): Database {
  const file = databaseFile();
  const cached = globalCache.__hostiDb;
  if (cached && cached.file === file) return cached.db;
  cached?.db.close();
  const opened = openDatabase(file);
  globalCache.__hostiDb = { file, db: opened };
  return opened;
}

export function nowIso(): string {
  return new Date().toISOString();
}
