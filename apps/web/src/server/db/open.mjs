import { runOpenDatabaseSync } from "../runtime.ts";

export function openDatabase(databaseFile) {
  return runOpenDatabaseSync(databaseFile);
}
