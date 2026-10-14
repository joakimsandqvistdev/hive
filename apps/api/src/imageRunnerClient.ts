import { Agent, fetch, type FormData } from "undici";
import { imageRunnerTransportFailure } from "./imageRunnerErrors.js";

export const IMAGE_RUNNER_TIMEOUT_MS = 60 * 60 * 1000;

export function createImageRunnerClient(runnerUrl: string, timeoutMs = IMAGE_RUNNER_TIMEOUT_MS) {
  // Scope the longer HTTP timeouts to model inference, without changing other fetches.
  const dispatcher = new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
  return {
    async generate(form: FormData, signal: AbortSignal) {
      try {
        return await fetch(`${runnerUrl.replace(/\/$/, "")}/generate`, {
          method: "POST",
          body: form,
          dispatcher,
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
        });
      } catch (error) {
        throw new Error(imageRunnerTransportFailure(error), { cause: error });
      }
    },
    async generateVideo(form: FormData, signal: AbortSignal) {
      try {
        return await fetch(`${runnerUrl.replace(/\/$/, "")}/generate-video`, {
          method: "POST",
          body: form,
          dispatcher,
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
        });
      } catch (error) {
        throw new Error(imageRunnerTransportFailure(error).replaceAll("Image runner", "Video runner").replaceAll("image runner", "video runner"), { cause: error });
      }
    },
    close: () => dispatcher.close(),
  };
}
