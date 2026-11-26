import fs from "node:fs/promises";
import { Effect, Layer } from "effect";
import { directoryIdentity, RevisionIdentity, StorageError } from "@hosti/storage";

export const NodeRevisionIdentity = Layer.succeed(
  RevisionIdentity,
  RevisionIdentity.of({
    read: (directory) =>
      Effect.tryPromise({
        try: async () => {
          const info = await fs.stat(directory, { bigint: true });
          const identity = info.isDirectory() ? directoryIdentity(info) : null;
          if (!identity) throw new Error("Directory generation unavailable");
          return identity;
        },
        catch: () =>
          new StorageError({
            code: "invalid_transfer",
            message: "Revision unavailable",
            status: 404,
          }),
      }),
  }),
);
