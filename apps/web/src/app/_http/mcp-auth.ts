import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type McpPrincipal = { subject: string; clientId: string };

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export class McpAuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403) {
    super(status === 401 ? "Unauthorized" : "Forbidden");
    this.status = status;
  }
}

function configuration() {
  const issuer = process.env.CLERK_ISSUER;
  const audience = process.env.HOSTI_MCP_URL;
  const owner = process.env.HOSTI_OWNER_CLERK_USER_ID;
  if (!issuer || !audience || !owner) throw new McpAuthError(401);
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer.replace(/\/+$/, "")}/.well-known/jwks.json`));
    jwksByIssuer.set(issuer, jwks);
  }
  return { issuer, audience, owner, jwks };
}

export async function verifyMcpBearer(request: Request): Promise<McpPrincipal> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new McpAuthError(401);
  const { issuer, audience, owner, jwks } = configuration();
  let payload: JWTPayload & { client_id?: unknown; scope?: unknown };
  try {
    ({ payload } = await jwtVerify(authorization.slice(7), jwks, {
      issuer,
      audience,
      algorithms: ["RS256"],
      clockTolerance: 5,
      requiredClaims: ["exp", "sub", "client_id"],
    }));
  } catch {
    throw new McpAuthError(401);
  }
  if (
    typeof payload.sub !== "string" ||
    !payload.sub ||
    typeof payload.client_id !== "string" ||
    !payload.client_id ||
    !payload.client_id.trim() ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    payload.aud !== audience ||
    payload.sub.length > 256 ||
    payload.client_id.length > 256 ||
    payload.sid !== undefined ||
    payload.act !== undefined ||
    payload.may_act !== undefined
  ) {
    throw new McpAuthError(401);
  }
  if (
    payload.sub !== owner ||
    typeof payload.scope !== "string" ||
    !payload.scope.split(/\s+/).includes("email")
  )
    throw new McpAuthError(403);
  return { subject: payload.sub, clientId: payload.client_id };
}

export function isMcpDeleteClient(clientId: string): boolean {
  return (process.env.HOSTI_MCP_DELETE_CLIENT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(clientId);
}
