import { CATALOG_UPLOAD } from "@hosti/identity";
import {
  COLLECTION_RULE,
  PUSH_LIMITS,
  SLUG_RULE,
  isValidSlug,
  readCollection,
} from "@hosti/shared";
import { Readable } from "node:stream";
import { archiveFormat, archiveSource } from "@/app/_http/archive";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { errorResponse, failureResponse, jsonResponse } from "@/server/api-responses";
import { guardMutation, guardSession } from "@/server/auth/admin";
import { baseUrlFromHeaders, bundlesDir, keepRevisions } from "@/server/config";
import { uploadArchive } from "@/use-cases/upload-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const signedIn = guardSession(request);
  if (!signedIn.ok) return asJson(signedIn.response);

  // Authenticate before parsing the archive body to reject strangers without buffering uploads.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("bad_upload", "That upload did not arrive as a form", 400);
  }

  const guard = guardMutation(request, form);
  if (!guard.ok) return asJson(guard.response);

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorResponse("empty_body", "Choose a .zip or .tar.gz to upload", 400);
  }
  if (file.size > PUSH_LIMITS.maxCompressedBytes) {
    return errorResponse(
      "push_too_large",
      `That archive is ${file.size} bytes; the limit is ${PUSH_LIMITS.maxCompressedBytes}`,
      413,
    );
  }

  const slug = text(form.get("slug"));
  if (!isValidSlug(slug)) return errorResponse("bad_slug", SLUG_RULE, 400);

  const collection = readCollection(text(form.get("collection")));
  if (collection === undefined) return errorResponse("bad_collection", COLLECTION_RULE, 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const format = archiveFormat(bytes);
  if (!format) {
    return errorResponse(
      "unknown_archive",
      `${file.name} is neither a zip nor a gzipped tar, whatever it is called`,
      400,
    );
  }

  try {
    const stored = await runAppUseCase(
      uploadArchive({
        slug,
        source: archiveSource(
          Readable.from([bytes]),
          "bad_tarball",
          "Cannot read the pushed archive",
        ),
        format,
        title: text(form.get("title")) || null,
        collection,
        bundlesRoot: bundlesDir(),
        baseUrl: baseUrlFromHeaders(request.headers),
        pushedBy: CATALOG_UPLOAD,
        keep: keepRevisions(),
      }),
    );
    return jsonResponse(stored, 201);
  } catch (error) {
    return failureResponse(error);
  }
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

const CODE_BY_STATUS: Record<number, string> = {
  401: "not_signed_in",
  403: "stale_form",
  503: "not_configured",
};

async function asJson(refusal: Response): Promise<Response> {
  return errorResponse(
    CODE_BY_STATUS[refusal.status] ?? "refused",
    await refusal.text(),
    refusal.status,
  );
}
