import { FenceRejected as CatalogFenceRejected } from "@hosti/catalog";
import { Schema } from "effect";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "./test-fixtures";
import fs from "node:fs/promises";
import * as support from "./support";
import { POST as fenceOn } from "@/app/internal/deploy/fence/on/route";
import { POST as fenceOff } from "@/app/internal/deploy/fence/off/route";

const failure: { error: unknown } = { error: null };

vi.mock("@/server/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/runtime")>()),
  runUseCase: async () => ({ ok: false, error: failure.error }),
}));

class FenceRejected extends Schema.TaggedError<FenceRejected>()("FenceRejected", {
  code: Schema.String,
  message: Schema.String,
}) {}

class WriterUnavailable extends Schema.TaggedError<WriterUnavailable>()("WriterUnavailable", {
  message: Schema.String,
}) {}

let dataDir: string;

beforeAll(async () => {
  dataDir = await useTempDataDir();
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

function fenceRequest(kind: "on" | "off"): Request {
  return support.privateRequest(`http://localhost:3000/internal/deploy/fence/${kind}`, {
    method: "POST",
    headers: { "X-Small-App-Epoch": "proof-epoch-a" },
    body: JSON.stringify({ epoch: "proof-epoch-a" }),
  });
}

describe("fence hook failures from another bundle's error classes", () => {
  it.each([
    [
      "state_invalid copy",
      new FenceRejected({ code: "state_invalid", message: "unreadable" }),
      409,
    ],
    ["epoch_spent copy", new FenceRejected({ code: "epoch_spent", message: "spent" }), 409],
    ["epoch_stale copy", new FenceRejected({ code: "epoch_stale", message: "stale" }), 409],
    ["invalid_epoch copy", new FenceRejected({ code: "invalid_epoch", message: "bad" }), 400],
    ["catalog class", new CatalogFenceRejected({ code: "epoch_stale", message: "stale" }), 409],
    ["writer pause copy", new WriterUnavailable({ message: "paused" }), 503],
    ["unknown code copy", new FenceRejected({ code: "bogus", message: "bogus" }), 500],
    ["unbranded object", { _tag: "FenceRejected", code: "epoch_stale", message: "stale" }, 500],
    ["plain error", new Error("boom"), 500],
  ])("maps %s to its HTTP status on both hooks", async (_label, error, status) => {
    failure.error = error;
    for (const hook of [fenceOn, fenceOff]) {
      const response = await hook(fenceRequest(hook === fenceOn ? "on" : "off"));
      expect(response.status).toBe(status);
      if (error instanceof FenceRejected && status !== 500) {
        expect(await response.json()).toEqual({ error: error.code, message: error.message });
      }
    }
  });
});
