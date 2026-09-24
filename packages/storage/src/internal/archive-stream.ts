import { Effect, Ref, Stream } from "effect";
import { storageError, type StorageError } from "../storage-error";

export function limitCompressedBytes(
  source: Stream.Stream<Uint8Array, StorageError>,
  maxBytes: number,
): Stream.Stream<Uint8Array, StorageError> {
  let total = 0;
  return source.pipe(
    Stream.mapEffect((chunk) => {
      total += chunk.length;
      return total > maxBytes
        ? Effect.fail(
            storageError(
              "push_too_large",
              `Push body is larger than ${maxBytes} bytes compressed`,
              413,
            ),
          )
        : Effect.succeed(chunk);
    }),
  );
}

export function collectLimited(
  source: Stream.Stream<Uint8Array, StorageError>,
  maxBytes: number,
): Effect.Effect<Uint8Array, StorageError> {
  return Effect.gen(function* () {
    const chunks: Uint8Array[] = [];
    const totalBytes = yield* Ref.make(0);
    yield* Stream.runForEach(source, (chunk) =>
      Effect.gen(function* () {
        const total = yield* Ref.updateAndGet(totalBytes, (current) => current + chunk.length);
        if (total > maxBytes) {
          return yield* storageError(
            "push_too_large",
            `Push body is larger than ${maxBytes} bytes compressed`,
            413,
          );
        }
        chunks.push(chunk);
      }),
    );

    const size = yield* Ref.get(totalBytes);
    const archive = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      archive.set(chunk, offset);
      offset += chunk.length;
    }
    return archive;
  });
}
