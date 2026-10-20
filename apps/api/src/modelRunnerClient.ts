import { randomUUID } from "node:crypto";
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
  const token = process.env.RUNNER_API_TOKEN;
  if (!token) throw new Error("Model runner authentication is not configured");
  return {
    async generate(modality: RunnerModality, form: FormData, signal: AbortSignal) {
      const generationId = randomUUID();
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
      let cancellation: Promise<void> | undefined;
      const cancelGeneration = () => cancellation ??= (async () => {
        try {
          await fetch(`${baseUrl}/cancel-generation/${generationId}`, {
            method: "POST",
            headers: { authorization: `Bearer ${token}` },
            dispatcher,
            signal: AbortSignal.timeout(2_000),
          });
        } catch {
          // The runner may already have stopped or completed this request.
        }
      })();
      // Keep this listener active while the caller reads the response body too.
      requestSignal.addEventListener("abort", () => { void cancelGeneration(); }, { once: true });
      try {
        return await fetch(`${baseUrl}${endpoints[modality]}`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "x-hive-generation-id": generationId },
          body: form,
          dispatcher,
          signal: requestSignal,
        });
      } catch (error) {
        // A caller abort can race with runner-side disconnect detection. Explicitly
        // cancel the matching inference so it cannot keep the shared GPU lock busy.
        await cancelGeneration();
        throw new Error(modelRunnerTransportFailure(error, modality), { cause: error });
      }
    },
    close: () => dispatcher.close(),
  };
}
