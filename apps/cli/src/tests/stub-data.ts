type Entry = { slug: string; mode: "private" | "link" | "pin"; shareSlug?: string };

export function sharingOf(entry: Entry) {
  return {
    mode: entry.mode,
    shareSlug: entry.shareSlug ?? entry.slug,
    hasPin: entry.mode === "pin",
  };
}

export function bundleOf(entry: Entry) {
  return {
    slug: entry.slug,
    title: entry.slug,
    collection: null,
    createdAt: "2026-09-17T10:00:00.000Z",
    updatedAt: "2026-09-17T10:00:00.000Z",
    currentRevision: { seq: 1, byteSize: 10, fileCount: 1, createdAt: "2026-09-17T10:00:00.000Z" },
    revisionCount: 1,
    sharing: sharingOf(entry),
  };
}
