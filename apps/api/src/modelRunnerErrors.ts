export type RunnerModality = "image" | "video" | "audio" | "text";

function modalityLabel(modality: RunnerModality): string {
  return modality === "image" ? "Image" : modality === "video" ? "Video" : modality === "audio" ? "Audio" : "Text";
}

export function modelRunnerTransportFailure(error: unknown, modality: RunnerModality = "image"): string {
  const label = modalityLabel(modality);
  const runner = `${label} runner`;
  const item = error && typeof error === "object" ? error as { name?: unknown; code?: unknown; cause?: { code?: unknown } } : {};
  const code = item.cause?.code ?? item.code;
  if (item.name === "TimeoutError" || code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") {
    return `${runner} request timed out after the allowed inference wait. The runner may still be processing this node; check its logs before starting another run.`;
  }
  if (item.name === "AbortError" || code === "UND_ERR_ABORTED") return `${runner} request was interrupted.`;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return `Cannot connect to the ${runner.toLowerCase()}. Check that the local runner is running and its configured address is reachable.`;
  }
  if (code === "UND_ERR_SOCKET" || code === "ECONNRESET") {
    return `${runner} connection closed before generation completed. Check the runner logs for a restart, crash, or memory failure.`;
  }
  return `${runner} connection failed. Check the local runner status and logs.`;
}

export async function modelRunnerRejection(response: { status: number; json: () => Promise<unknown> }, modality: RunnerModality = "image"): Promise<string> {
  const label = modalityLabel(modality);
  const runner = `${label} runner`;
  if (response.status === 409) {
    try {
      const body = await response.json() as { detail?: { code?: unknown } };
      if (body.detail?.code === "model_not_downloaded") return "This model has not been downloaded. Open Models and download it before starting the workflow.";
    } catch { /* Keep internal runner response details out of run summaries. */ }
  }
  if (response.status === 504) {
    return modality === "image"
      ? "Image runner stopped generation after its inference deadline and released the generation process. Try fewer steps or a smaller resolution."
      : `${runner} stopped generation after its inference deadline and released the generation process. Try a shorter prompt or simpler settings.`;
  }
  if (response.status === 500) {
    try {
      const body = await response.json() as { detail?: { code?: unknown } };
      if (body.detail?.code === "out_of_memory") {
        return `${runner} ran out of GPU or system memory. Try fewer inference steps or use a machine with more memory.`;
      }
      if (body.detail?.code === "generation_failed") {
        return modality === "image"
          ? "Image generation failed. Check the local image runner logs for the failure type and location."
          : `${label} generation failed. Check the local runner logs for the failure type and location.`;
      }
    } catch { /* Never expose arbitrary runner error bodies or exception messages. */ }
  }
  if (response.status === 503) return `${runner} is loading or unavailable. Check that the local runner is healthy.`;
  if (response.status === 422) {
    try {
      const body = await response.json() as { detail?: unknown };
      if (typeof body.detail === "string") return `${runner} rejected the request: ${body.detail.slice(0, 300)}`;
      if (Array.isArray(body.detail)) {
        const issues = body.detail.slice(0, 5).map((issue) => {
          const item = issue && typeof issue === "object" && !Array.isArray(issue) ? issue as Record<string, unknown> : {};
          const location = Array.isArray(item.loc) ? item.loc.filter((part) => part !== "body" && part !== "form").join(".") : "request";
          return `${location || "request"}: ${String(item.msg ?? "invalid value").slice(0, 120)}`;
        });
        if (issues.length) return `${runner} validation failed: ${issues.join("; ")}`;
      }
    } catch { /* Keep a safe generic summary for non-JSON runner errors. */ }
  }
  return `${runner} rejected the request with HTTP ${response.status}.`;
}
