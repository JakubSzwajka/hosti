import type {
  CatalogResponse,
  DeletedBundleResponse,
  ErrorResponse,
  PrunedRevisionsResponse,
  PushResponse,
  RevokedShareLinkResponse,
  ShareLinkResponse,
  ShareLinksResponse,
  SharePinResponse,
} from "@hosti/shared";
import type { Config } from "./config.ts";

/** A refusal from the server, or a server that never answered. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 0, code = "unreachable") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type PushInput = {
  slug: string;
  body: Buffer;
  title?: string;
  collection?: string;
};

export function createClient(config: Config) {
  async function call<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${config.token}`);

    let response: Response;
    try {
      response = await fetch(`${config.url}${pathname}`, { ...init, headers });
    } catch (error) {
      throw new ApiError(`Cannot reach ${config.url}: ${(error as Error).message}`);
    }

    const text = await response.text();
    const body = text ? (JSON.parse(text) as unknown) : {};
    if (!response.ok) {
      const failure = body as ErrorResponse;
      throw new ApiError(
        failure.message ?? `${response.status} from ${pathname}`,
        response.status,
        failure.error ?? "http_error",
      );
    }
    return body as T;
  }

  return {
    push(input: PushInput): Promise<PushResponse> {
      const headers = new Headers({ "Content-Type": "application/gzip" });
      if (input.title) headers.set("X-Hosti-Title", input.title);
      if (input.collection) headers.set("X-Hosti-Collection", input.collection);
      return call<PushResponse>(`/api/v1/bundles/${input.slug}/revisions`, {
        method: "POST",
        headers,
        body: new Uint8Array(input.body),
      });
    },

    catalog(): Promise<CatalogResponse> {
      return call<CatalogResponse>("/api/v1/bundles");
    },

    prune(slug: string): Promise<PrunedRevisionsResponse> {
      return call<PrunedRevisionsResponse>(`/api/v1/bundles/${slug}/prune`, { method: "POST" });
    },

    share(slug: string, unlisted: boolean, pin?: string): Promise<ShareLinkResponse> {
      return call<ShareLinkResponse>(`/api/v1/bundles/${slug}/share-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pin ? { unlisted, pin } : { unlisted }),
      });
    },
    setPin(shareSlug: string, pin: string): Promise<SharePinResponse> {
      return call<SharePinResponse>(`/api/v1/share-links/${shareSlug}/pin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
    },
    removePin(shareSlug: string): Promise<SharePinResponse> {
      return call<SharePinResponse>(`/api/v1/share-links/${shareSlug}/pin`, { method: "DELETE" });
    },

    links(slug: string): Promise<ShareLinksResponse> {
      return call<ShareLinksResponse>(`/api/v1/bundles/${slug}/share-links`);
    },

    remove(slug: string): Promise<DeletedBundleResponse> {
      return call<DeletedBundleResponse>(`/api/v1/bundles/${slug}`, { method: "DELETE" });
    },

    revoke(shareSlug: string): Promise<RevokedShareLinkResponse> {
      return call<RevokedShareLinkResponse>(`/api/v1/share-links/${shareSlug}`, {
        method: "DELETE",
      });
    },
  };
}

export type Client = ReturnType<typeof createClient>;
