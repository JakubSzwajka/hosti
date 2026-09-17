import {
  COLLECTION_RULE,
  PUSH_LIMITS,
  SLUG_RULE,
  isValidSlug,
  readCollection,
} from "@hosti/shared";
import { Readable } from "node:stream";
import { errorResponse, failureResponse, jsonResponse } from "@/server/api-responses";
import { guardMutation, guardSession } from "@/server/auth/admin";
import { baseUrlFromHeaders } from "@/server/config";
import { storeRevision } from "@/server/push";
import { archiveFormat } from "@/server/storage/revisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The catalog's own way in: the owner drops a `.zip` or a `.tar.gz` on the
 * grid and it lands as a bundle, or as the next revision of one that exists.
 *
 * Owner only. It takes the admin session and the same mutation token every
 * other change the catalog makes carries, and no push token is involved: this
 * is not a second public endpoint, it is the upload half of the catalog.
 *
 * It answers JSON rather than a redirect, because the browser posts it with
 * XHR to draw a progress bar and to print the server's own refusal.
 *
 * The session is checked on the headers alone, before the body is touched.
 * Reading the form first would have this route buffer 50 MB from a stranger
 * and only then refuse them.
 */
export async function POST(request: Request): Promise<Response> {
  const signedIn = guardSession(request);
  if (!signedIn.ok) return asJson(signedIn.response);

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
    const stored = await storeRevision({
      slug,
      body: Readable.from([bytes]),
      format,
      title: text(form.get("title")) || null,
      collection,
      baseUrl: baseUrlFromHeaders(request.headers),
    });
    return jsonResponse(stored, 201);
  } catch (error) {
    return failureResponse(error);
  }
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The shared mutation gate answers in plain text; the drop zone reads JSON. */
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
