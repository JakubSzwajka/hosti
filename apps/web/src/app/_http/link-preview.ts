import type { Metadata } from "next";
import { headers } from "next/headers";
import { baseUrlFromHeaders } from "@/server/config";

export const PREVIEW_TITLE = "Hosti";
export const PREVIEW_DESCRIPTION =
  "Hosti is an open-source, self-hosted catalog for the static bundles coding agents push.";
export const PREVIEW_IMAGE_PATH = "/opengraph-image.png";
const PREVIEW_IMAGE_ALT = "Hosti. A self-hosted catalog for coding agents.";

export async function linkPreview(path: string): Promise<Metadata> {
  // Build-time metadata cannot see HOSTI_PUBLIC_URL, so the origin is read per request.
  const base = baseUrlFromHeaders(await headers());
  return {
    metadataBase: new URL(base),
    title: PREVIEW_TITLE,
    description: PREVIEW_DESCRIPTION,
    openGraph: {
      type: "website",
      siteName: PREVIEW_TITLE,
      title: PREVIEW_TITLE,
      description: PREVIEW_DESCRIPTION,
      url: `${base}${path}`,
      images: [{ url: PREVIEW_IMAGE_PATH, width: 1200, height: 630, alt: PREVIEW_IMAGE_ALT }],
    },
    twitter: {
      card: "summary_large_image",
      title: PREVIEW_TITLE,
      description: PREVIEW_DESCRIPTION,
      images: [PREVIEW_IMAGE_PATH],
    },
  };
}
