import Database from "better-sqlite3";
import { sqliteCode } from "./open-database";

export function tryAcquireWriterLease(leaseFile: string): Database.Database | null {
  const lease = new Database(leaseFile, { timeout: 0 });
  try {
    lease.pragma("locking_mode = EXCLUSIVE");
    lease.transaction(() => undefined).exclusive();
    return lease;
  } catch (cause) {
    lease.close();
    if (sqliteCode(cause) === "SQLITE_BUSY") return null;
    throw cause;
  }
}
