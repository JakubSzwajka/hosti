import { isPushScope } from "@hosti/shared";
import { connectRedirect } from "@/app/_http/connect-response";
import { connectPath } from "@/app/_http/return-path";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { guardMutation } from "@/server/auth/admin";
import { PushError } from "@/server/errors";
import { approveAgentConnection } from "@/use-cases/approve-agent-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;
  const path = connectPath(id);
  if (!path) return new Response("No such agent connection", { status: 404 });

  const grant = form.getAll("scope").filter(isPushScope);
  try {
    await runAppUseCase(approveAgentConnection(id, grant));
  } catch (error) {
    if (error instanceof PushError) return connectRedirect(`${path}?error=${error.code}`);
    throw error;
  }
  return connectRedirect(path);
}
