import { failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { acceptPush } from "@/server/push";
import { authenticatePush } from "@/server/push-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  // The token that opened this request is also the one recorded on the
  // revision it writes, so the two can never name different tokens.
  const pushedBy = authenticatePush(request);
  if (!pushedBy) return unauthorized();
  const { slug } = await context.params;
  try {
    return jsonResponse(await acceptPush(request, slug, pushedBy), 201);
  } catch (error) {
    return failureResponse(error);
  }
}
