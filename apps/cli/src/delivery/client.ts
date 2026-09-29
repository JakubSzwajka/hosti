import type {
  AgentAuthorizationCreatedResponse,
  AgentAuthorizationRequest,
  AgentAuthorizationStatusResponse,
  BundleResponse,
  CatalogResponse,
  DeletedBundleResponse,
  ErrorResponse,
  PrunedRevisionsResponse,
  PushResponse,
  SharingMode,
  SharingResponse,
  WhoamiResponse,
} from "@hosti/shared";
import type { Config } from "./config.ts";

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

async function callApi<T>(
  base: string,
  pathname: string,
  init: RequestInit = {},
  bearer?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);

  let response: Response;
  try {
    response = await fetch(`${base}${pathname}`, { ...init, headers });
  } catch (error) {
    throw new ApiError(`Cannot reach ${base}: ${(error as Error).message}`);
  }

  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    if (response.ok) throw new ApiError(`${base}${pathname} did not answer JSON`, response.status);
  }
  if (!response.ok) {
    const failure = (body ?? {}) as Partial<ErrorResponse>;
    throw new ApiError(
      failure.message ?? `${response.status} from ${pathname}`,
      response.status,
      failure.error ?? "http_error",
    );
  }
  return body as T;
}

export function createConnectionClient(base: string) {
  return {
    create(request: AgentAuthorizationRequest): Promise<AgentAuthorizationCreatedResponse> {
      return callApi<AgentAuthorizationCreatedResponse>(base, "/api/v1/agent-authorizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
    },

    /** The polling secret travels only in the Authorization header, never in the URL. */
    poll(id: string, pollingSecret: string): Promise<AgentAuthorizationStatusResponse> {
      return callApi<AgentAuthorizationStatusResponse>(
        base,
        `/api/v1/agent-authorizations/${encodeURIComponent(id)}`,
        {},
        pollingSecret,
      );
    },
  };
}

export type ConnectionClient = ReturnType<typeof createConnectionClient>;

export function createClient(config: Config) {
  const call = <T>(pathname: string, init: RequestInit = {}): Promise<T> =>
    callApi<T>(config.url, pathname, init, config.token);

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

    whoami(): Promise<WhoamiResponse> {
      return call<WhoamiResponse>("/api/v1/whoami");
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
