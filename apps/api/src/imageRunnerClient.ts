/** @deprecated Use createModelRunnerClient; retained for existing internal callers. */
import { createModelRunnerClient, MODEL_RUNNER_TIMEOUT_MS } from "./modelRunnerClient.js";
import type { FormData } from "undici";

export const IMAGE_RUNNER_TIMEOUT_MS = MODEL_RUNNER_TIMEOUT_MS;

export function createImageRunnerClient(runnerUrl: string, timeoutMs = IMAGE_RUNNER_TIMEOUT_MS) {
  const client = createModelRunnerClient(runnerUrl, timeoutMs);
  return {
    generate: (form: FormData, signal: AbortSignal) => client.generate("image", form, signal),
    generateVideo: (form: FormData, signal: AbortSignal) => client.generate("video", form, signal),
    generateAudio: (form: FormData, signal: AbortSignal) => client.generate("audio", form, signal),
    close: client.close,
  };
}
