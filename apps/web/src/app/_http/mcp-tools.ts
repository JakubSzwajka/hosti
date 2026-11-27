import { Effect, Layer, Schema } from "effect";
import { McpServer, Tool, Toolkit } from "effect/unstable/ai";
import { sharingBody } from "@hosti/bundles";
import { PUSH_LIMITS } from "@hosti/shared";
import { bundlesDir, dataDir, keepRevisions, publicBaseUrl } from "@/server/config";
import { PushError } from "@/server/errors";
import { listCatalog } from "@/use-cases/list-catalog";
import { showBundle } from "@/use-cases/show-bundle";
import { listRevisions } from "@/use-cases/list-revisions";
import { setBundleSharing } from "@/use-cases/set-sharing";
import { rotateShare } from "@/use-cases/rotate-share";
import { pruneBundle } from "@/use-cases/prune-bundle";
import { deleteBundle } from "@/use-cases/delete-bundle";
import { issueUploadTransfer } from "@/use-cases/issue-upload-transfer";
import { issueDownloadTransfer } from "@/use-cases/issue-download-transfer";
import { runAppUseCase } from "./run-use-case";
import { isMcpDeleteClient, type McpPrincipal } from "./mcp-auth";
import { transferUrl } from "./mcp-capability";

const slug = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64));
const metadata = Schema.String.check(Schema.isMaxLength(200));
const positive = Schema.Int.check(Schema.isGreaterThan(0));
const failure = Schema.Struct({ error: Schema.String, message: Schema.String });
const toolkit = Toolkit.make(
  Tool.make("list_bundles", {
    description: "List bundles. Filter by collection and use bounded offset pagination.",
    parameters: Schema.Struct({
      collection: Schema.optional(Schema.NullOr(metadata)),
      offset: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
      limit: Schema.optional(positive.check(Schema.isLessThanOrEqualTo(100))),
    }),
    success: Schema.Record(Schema.String, Schema.Unknown),
    failure,
  })
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false),
  Tool.make("get_bundle", {
    description:
      "Read bundle metadata, kept revisions, sharing and attribution. Never returns a pin.",
    parameters: Schema.Struct({ slug }),
    success: Schema.Record(Schema.String, Schema.Unknown),
    failure,
  })
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false),
  Tool.make("push", {
    description:
      "Reserve an upload. Send archive bytes with curl PUT to the returned URL, never in MCP. A push preserves sharing.",
    parameters: Schema.Struct({
      slug,
      title: Schema.optional(metadata),
      collection: Schema.optional(metadata),
    }),
    success: Schema.Record(Schema.String, Schema.Unknown),
    failure,
  }).annotate(Tool.Destructive, false),
  Tool.make("get_download_link", {
    description:
      "Issue a ten-minute curl GET link pinned to one exact kept revision. Current is resolved now.",
    parameters: Schema.Struct({
      slug,
      revision: Schema.optional(Schema.Union([positive, Schema.Literal("current")])),
    }),
    success: Schema.Record(Schema.String, Schema.Unknown),
    failure,
  })
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false),
  Tool.make("set_sharing", {
    description:
      "Set private, link or pin sharing. A pin must be supplied by the owner, never invented.",
    parameters: Schema.Struct({
      slug,
      mode: Schema.Literals(["private", "link", "pin"]),
      pin: Schema.optional(Schema.String),
    }),
    success: Schema.Record(Schema.String, Schema.Unknown),
    failure,
  }),
  Tool.make("rotate_link", {
    description: "Invalidate the old share link. Preserve sharing mode and pin.",
    parameters: Schema.Struct({ slug }),
    success: Schema.Record(Schema.String, Schema.Unknown),
    failure,
  }),
  Tool.make("prune", {
    description: "Prune using the instance retention count. Never remove current.",
    parameters: Schema.Struct({ slug }),
    success: Schema.Record(Schema.String, Schema.Unknown),
    failure,
  }),
  Tool.make("delete_bundle", {
    description:
      "Delete a bundle and its revisions. Requires delete scope and confirm equal to the bundle slug.",
    parameters: Schema.Struct({ slug, confirm: Schema.String }),
    success: Schema.Record(Schema.String, Schema.Unknown),
    failure,
  }),
);

export const MCP_WRITE_TOOLS: ReadonlySet<string> = new Set([
  "push",
  "get_download_link",
  "set_sharing",
  "rotate_link",
  "prune",
  "delete_bundle",
]);

function required<A>(value: A | null): A {
  if (value === null) throw new PushError("not_found", "Bundle unavailable", 404);
  return value;
}

export function mcpTools(principal: McpPrincipal, clientName: string, requestOrigin: string) {
  const baseUrl = publicBaseUrl(new Request(requestOrigin));
  const call = <A>(work: () => Promise<A>) =>
    Effect.tryPromise({
      try: work,
      catch: (error) => ({
        error: error instanceof PushError ? error.code : "tool_failed",
        message: error instanceof PushError ? error.message : "Tool failed",
      }),
    });
  const handlers = toolkit.toLayer({
    list_bundles: ({ collection, offset = 0, limit = 50 }) =>
      call(async () => {
        const all = await runAppUseCase(listCatalog());
        const filtered =
          collection === undefined ? all : all.filter((b) => b.collection === collection);
        return {
          bundles: filtered.slice(offset, offset + limit),
          nextOffset: offset + limit < filtered.length ? offset + limit : null,
        };
      }),
    get_bundle: ({ slug }) =>
      call(async () => {
        const value = required(await runAppUseCase(showBundle(slug)));
        return {
          bundle: value.bundle,
          revisions: await runAppUseCase(listRevisions(value.record.id)),
          shareUrl: sharingBody(value.record, baseUrl).shareUrl,
          adminUrl: `${baseUrl}/b/${slug}`,
        };
      }),
    push: ({ slug, title, collection }) =>
      call(async () => {
        const grant = await runAppUseCase(
          issueUploadTransfer(dataDir(), {
            kind: "upload",
            slug,
            title: title?.trim() || null,
            collection: collection?.trim() || null,
            subject: principal.subject,
            clientId: principal.clientId,
            clientName,
            maxBytes: PUSH_LIMITS.maxCompressedBytes,
          }),
        );
        return {
          method: "PUT",
          url: transferUrl("upload", grant.id),
          expiresAt: new Date(grant.expiresAt).toISOString(),
          limits: PUSH_LIMITS,
          contentType: "application/gzip",
        };
      }),
    get_download_link: ({ slug, revision = "current" }) =>
      call(async () => {
        const grant = required(
          await runAppUseCase(
            issueDownloadTransfer({
              slug,
              revision,
              bundlesRoot: bundlesDir(),
              dataDir: dataDir(),
              ...principal,
            }),
          ),
        );
        return {
          method: "GET",
          url: transferUrl("download", grant.id),
          expiresAt: new Date(grant.expiresAt).toISOString(),
          revision: grant.input.kind === "download" ? grant.input.seq : null,
        };
      }),
    set_sharing: ({ slug, mode, pin }) =>
      call(async () => {
        const row = required(
          await runAppUseCase(setBundleSharing({ slug, mode, pin, pinSource: "json" })),
        );
        return sharingBody(row, baseUrl);
      }),
    rotate_link: ({ slug }) =>
      call(async () => {
        const row = required(await runAppUseCase(rotateShare(slug)));
        return sharingBody(row, baseUrl);
      }),
    prune: ({ slug }) =>
      call(async () => {
        required(await runAppUseCase(showBundle(slug)));
        return {
          bundle: slug,
          keep: keepRevisions(),
          ...(await runAppUseCase(
            pruneBundle({
              bundleSlug: slug,
              bundlesRoot: bundlesDir(),
              keep: keepRevisions(),
            }),
          )),
        };
      }),
    delete_bundle: ({ slug, confirm }) =>
      call(async () => {
        if (!isMcpDeleteClient(principal.clientId))
          throw new PushError("missing_scope", "Delete scope required", 403);
        if (confirm !== slug)
          throw new PushError("confirmation_required", "Confirm the bundle slug", 400);
        const deleted = await runAppUseCase(deleteBundle({ slug, bundlesRoot: bundlesDir() }));
        if (!deleted) throw new PushError("not_found", "Bundle unavailable", 404);
        return { bundle: slug, deleted: true };
      }),
  });
  return Layer.effectDiscard(McpServer.registerToolkit(toolkit)).pipe(Layer.provide(handlers));
}
