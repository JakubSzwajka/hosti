import type { PushScope } from "@hosti/shared";

export const SCOPE_MEANING: Record<PushScope, string> = {
  publish: "list and read bundles, push revisions, prune old ones",
  share: "make a bundle private, open it by link or behind a pin, rotate its link",
  delete: "delete a bundle with its revisions and files",
};
