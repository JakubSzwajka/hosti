import { Context, Effect, Layer, Schema } from "effect";
import type { CatalogError } from "./catalog-error";

export const WRITER_STATE_FILE = "hosti-writer.json";
export const WRITER_LEASE_FILE = "hosti-writer.lease";

export const WriterEpoch = Schema.String.check(Schema.isPattern(/^[\x21-\x7e]{1,200}$/));

export const WriterState = Schema.Struct({
  version: Schema.Literal(1),
  owner: Schema.NullOr(WriterEpoch),
  fence: Schema.NullOr(WriterEpoch),
  spent: Schema.Array(WriterEpoch),
});
export type WriterState = typeof WriterState.Type;

export const UNMANAGED_WRITER_STATE: WriterState = {
  version: 1,
  owner: null,
  fence: null,
  spent: [],
};

export type WriterStatus = {
  readonly ready: boolean;
  readonly writer: boolean;
  readonly schema: string;
  readonly epoch: string | null;
};

export type WriterObservation = WriterStatus & { readonly bundles: number };

export type FenceOnResult = {
  readonly fenced: true;
  readonly drained: true;
  readonly epoch: string;
};
export type FenceOffResult = { readonly fenced: false; readonly epoch: string };

export type WriterPermit = { released: boolean };

export class WriterUnavailable extends Schema.TaggedError<WriterUnavailable>()(
  "WriterUnavailable",
  { message: Schema.String },
) {}

export class FenceRejected extends Schema.TaggedError<FenceRejected>()("FenceRejected", {
  code: Schema.Literals([
    "invalid_epoch",
    "epoch_owned",
    "epoch_spent",
    "epoch_stale",
    "fence_active",
    "fence_cancelled",
    "not_writer",
    "lease_busy",
    "state_invalid",
  ]),
  message: Schema.String,
}) {}

export class WriterStateStore extends Context.Service<
  WriterStateStore,
  {
    readonly read: (dataDir: string) => Effect.Effect<string | null, CatalogError>;
    readonly write: (dataDir: string, contents: string) => Effect.Effect<void, CatalogError>;
  }
>()("@hosti/catalog/WriterStateStore") {
  static readonly memory = (): Layer.Layer<WriterStateStore> => {
    const files = new Map<string, string>();
    return Layer.succeed(
      WriterStateStore,
      WriterStateStore.of({
        read: (dataDir) => Effect.sync(() => files.get(dataDir) ?? null),
        write: (dataDir, contents) =>
          Effect.sync(() => {
            files.set(dataDir, contents);
          }),
      }),
    );
  };
}
