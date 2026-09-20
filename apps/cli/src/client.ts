import type {
  BundleResponse,
  CatalogResponse,
  DeletedBundleResponse,
  ErrorResponse,
  PrunedRevisionsResponse,
  PushResponse,
  SharingMode,
  SharingResponse,
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

    bundle(slug: string): Promise<BundleResponse> {
      return call<BundleResponse>(`/api/v1/bundles/${slug}`);
    },

    /** Put the bundle into one of the three states. The pin is never read back. */
    share(slug: string, mode: SharingMode, pin?: string): Promise<SharingResponse> {
      return call<SharingResponse>(`/api/v1/bundles/${slug}/sharing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pin ? { mode, pin } : { mode }),
      });
    },

    /** Mint a fresh share slug. The old URL stops answering. */
    rotate(slug: string): Promise<SharingResponse> {
      return call<SharingResponse>(`/api/v1/bundles/${slug}/sharing/rotate`, { method: "POST" });
    },

    remove(slug: string): Promise<DeletedBundleResponse> {
      return call<DeletedBundleResponse>(`/api/v1/bundles/${slug}`, { method: "DELETE" });
    },
  };
}

export type Client = ReturnType<typeof createClient>;
