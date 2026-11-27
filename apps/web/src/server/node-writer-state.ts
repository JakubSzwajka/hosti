import { CatalogError, WRITER_STATE_FILE, WriterStateStore } from "@hosti/catalog";
import { Effect, Layer } from "effect";
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import path from "node:path";

const MAX_STATE_BYTES = 1_048_576;

function readState(dataDir: string): string | null {
  const file = path.join(dataDir, WRITER_STATE_FILE);
  let contents: Buffer;
  try {
    contents = readFileSync(file);
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return null;
    throw cause;
  }
  if (contents.byteLength > MAX_STATE_BYTES) throw new Error("Writer state file is too large");
  return contents.toString("utf8");
}

function syncPath(target: string): void {
  const descriptor = openSync(target, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeStateDurably(dataDir: string, contents: string): void {
  const file = path.join(dataDir, WRITER_STATE_FILE);
  const staged = `${file}.${process.pid}.next`;
  rmSync(staged, { force: true });
  const descriptor = openSync(staged, "wx", 0o600);
  try {
    writeSync(descriptor, contents);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(staged, file);
  syncPath(dataDir);
}

export const NodeWriterStateStore = Layer.succeed(
  WriterStateStore,
  WriterStateStore.of({
    read: (dataDir) =>
      Effect.try({
        try: () => readState(dataDir),
        catch: (cause) =>
          new CatalogError({ operation: "readWriterState", message: String(cause) }),
      }),
    write: (dataDir, contents) =>
      Effect.try({
        try: () => writeStateDurably(dataDir, contents),
        catch: (cause) =>
          new CatalogError({ operation: "writeWriterState", message: String(cause) }),
      }),
  }),
);
