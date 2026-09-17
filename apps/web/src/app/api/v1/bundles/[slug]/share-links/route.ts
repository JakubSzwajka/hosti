import type { ShareLinkResponse, ShareLinksResponse } from "@hosti/shared";
import { errorResponse, failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { findBundle } from "@/server/catalog";
import { publicBaseUrl } from "@/server/config";
import { authenticatePush } from "@/server/push-tokens";
import { createShareLink, describeShareLink, listShareLinks } from "@/server/share-links";
import { hashPin, readPin, requireSigningSecret } from "@/server/share-pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

const noSuchBundle = (slug: string): Response =>
  errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);

/** Open a bundle to the public, optionally behind an unguessable slug and a PIN. */
export async function POST(request: Request, context: Context): Promise<Response> {
  if (!authenticatePush(request)) return unauthorized();
  const { slug } = await context.params;
  try {
    const bundle = findBundle(slug);
    if (!bundle) return noSuchBundle(slug);
    const { unlisted, pin } = await readOptions(request);
    if (pin) requireSigningSecret();
    const row = createShareLink(bundle, {
      unlisted,
      pinHash: pin ? await hashPin(pin) : null,
    });
    return jsonResponse(
      {
        bundle: bundle.slug,
        link: describeShareLink(row, publicBaseUrl(request)),
      } satisfies ShareLinkResponse,
      201,
    );
  } catch (error) {
    return failureResponse(error);
  }
}

/** The share links of one bundle, oldest first. */
export async function GET(request: Request, context: Context): Promise<Response> {
  if (!authenticatePush(request)) return unauthorized();
  const { slug } = await context.params;
  try {
    const bundle = findBundle(slug);
    if (!bundle) return noSuchBundle(slug);
    return jsonResponse({
      bundle: bundle.slug,
      links: listShareLinks(bundle.id, publicBaseUrl(request)),
    } satisfies ShareLinksResponse);
  } catch (error) {
    return failureResponse(error);
  }
}

/** `?unlisted=1` or a JSON body; a body-less POST is the plain case. */
async function readOptions(request: Request): Promise<{ unlisted: boolean; pin: string | null }> {
  const query = new URL(request.url).searchParams;
  const text = await request.text().catch(() => "");
  const body = text.trim() ? (JSON.parse(text) as { unlisted?: boolean; pin?: unknown }) : {};
  return {
    unlisted: query.get("unlisted") !== null || body.unlisted === true,
    pin: readPin(query.get("pin") ?? body.pin),
  };
}
