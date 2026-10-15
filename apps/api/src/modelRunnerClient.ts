import { Agent, fetch, type FormData } from "undici";
import { modelRunnerTransportFailure, type RunnerModality } from "./modelRunnerErrors.js";

export const MODEL_RUNNER_TIMEOUT_MS = 60 * 60 * 1000;
const endpoints: Record<RunnerModality, string> = {
  text: "/generate-text",
  image: "/generate",
  video: "/generate-video",
  audio: "/generate-audio",
};

export function createModelRunnerClient(runnerUrl: string, timeoutMs = MODEL_RUNNER_TIMEOUT_MS) {
  const dispatcher = new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
  const baseUrl = runnerUrl.replace(/\/$/, "");
  return {
    async generate(modality: RunnerModality, form: FormData, signal: AbortSignal) {
      try {
        return await fetch(`${baseUrl}${endpoints[modality]}`, {
          method: "POST",
          body: form,
          dispatcher,
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
        });
      } catch (error) {
        throw new Error(modelRunnerTransportFailure(error, modality), { cause: error });
      }
    },
    close: () => dispatcher.close(),
  };
}
