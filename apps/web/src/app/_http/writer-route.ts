import { writerPausedResponse } from "@/server/api-responses";
import { PushError, WRITER_PAUSED } from "@/server/errors";
import { withWriter } from "./run-use-case";

export function writerRoute<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await withWriter(() => handler(...args));
    } catch (error) {
      if (error instanceof PushError && error.code === WRITER_PAUSED) {
        return writerPausedResponse(error.message);
      }
      throw error;
    }
  };
}
