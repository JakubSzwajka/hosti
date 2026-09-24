import { Context, Layer, type Stream } from "effect";
import type { StorageError } from "./storage-error";
import type { ArchiveEntry } from "./types";

export class ArchiveCodec extends Context.Service<
  ArchiveCodec,
  {
    gunzip(
      source: Stream.Stream<Uint8Array, StorageError>,
    ): Stream.Stream<Uint8Array, StorageError>;
    inflateRaw(
      source: Stream.Stream<Uint8Array, StorageError>,
    ): Stream.Stream<Uint8Array, StorageError>;
    tarEntries(
      source: Stream.Stream<Uint8Array, StorageError>,
    ): Stream.Stream<ArchiveEntry, StorageError>;
  }
>()("@hosti/storage/ArchiveCodec") {
  static readonly layer = (codec: ArchiveCodec["Service"]): Layer.Layer<ArchiveCodec> =>
    Layer.succeed(ArchiveCodec)(codec);
}
