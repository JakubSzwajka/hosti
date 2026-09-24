import { BundlesError, queueSharingWrite, readSharingMode, setSharing } from "@hosti/bundles";
import { Catalog } from "@hosti/catalog";
import { Identity } from "@hosti/identity";
import { Effect } from "effect";

export type SetSharingInput = {
  slug: string;
  mode: unknown;
  pin: unknown;
  pinSource: "json" | "form";
};

export const setBundleSharing = Effect.fn("setBundleSharing")(function* (input: SetSharingInput) {
  const catalog = yield* Catalog;
  const identity = yield* Identity;
  const bundle = yield* catalog.findBundle(input.slug);
  if (!bundle) return null;

  const mode = yield* readSharingMode(input.mode);
  const pin =
    input.pinSource === "json"
      ? yield* identity.readJsonPin(input.pin)
      : yield* identity.readFormPin(input.pin);
  if (pin && mode !== "pin") {
    return yield* new BundlesError({
      code: "pin_not_wanted",
      message: 'A pin only belongs on mode "pin"',
      status: 400,
    });
  }
  if (pin) yield* identity.requireSigningSecret;

  return yield* queueSharingWrite(
    bundle.id,
    Effect.gen(function* () {
      const pinHash = pin ? yield* identity.hashPin(pin) : undefined;
      yield* setSharing(bundle.id, { mode, ...(pinHash ? { pinHash } : {}) });
      return yield* catalog.findBundle(input.slug);
    }),
  );
});
