import { connectRedirect } from "@/app/_http/connect-response";
import { connectPath } from "@/app/_http/return-path";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { guardMutation } from "@/server/auth/admin";
import { denyAgentConnection } from "@/use-cases/deny-agent-connection";
import { writerRoute } from "@/app/_http/writer-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function post(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;
  const path = connectPath(id);
  if (!path) return new Response("No such agent connection", { status: 404 });

  await runAppUseCase(denyAgentConnection(id));
  return connectRedirect(path);
}

export const POST = writerRoute(post);
