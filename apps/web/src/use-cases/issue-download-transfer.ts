import { BundlesError } from "@hosti/bundles";
import { Catalog } from "@hosti/catalog";
import { Storage, Transfers, RevisionIdentity } from "@hosti/storage";
import { Effect } from "effect";

export const issueDownloadTransfer = Effect.fn("issueDownloadTransfer")(function* (input: {
  dataDir: string;
  bundlesRoot: string;
  slug: string;
  revision: number | "current";
  subject: string;
  clientId: string;
}) {
  const catalog = yield* Catalog;
  const bundle = yield* catalog.findBundle(input.slug);
  if (!bundle) return null;
  const revisions = yield* catalog.listRevisions(bundle.id);
  const seq = input.revision === "current" ? revisions.find((r) => r.current)?.seq : input.revision;
  if (
    seq === undefined ||
    !Number.isSafeInteger(seq) ||
    seq < 1 ||
    !revisions.some((r) => r.seq === seq)
  ) {
    return yield* new BundlesError({
      code: "not_found",
      message: "Revision unavailable",
      status: 404,
    });
  }
  const storage = yield* Storage;
  const identities = yield* RevisionIdentity;
  const transfers = yield* Transfers;
  const directory = yield* storage.revisionDir(input.bundlesRoot, input.slug, seq);
  const identity = yield* identities.read(directory);
  return yield* transfers.issue(input.dataDir, {
    kind: "download",
    slug: input.slug,
    seq,
    identity,
    subject: input.subject,
    clientId: input.clientId,
  });
});
