export function imageRunnerTransportFailure(error: unknown): string {
  const item = error && typeof error === "object" ? error as { name?: unknown; code?: unknown; cause?: { code?: unknown } } : {};
  const code = item.cause?.code ?? item.code;
  if (item.name === "TimeoutError" || code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") {
    return "Image runner request timed out after the allowed inference wait. The runner may still be processing this node; check its logs before starting another run.";
  }
  if (item.name === "AbortError" || code === "UND_ERR_ABORTED") return "Image runner request was interrupted.";
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return "Cannot connect to the image runner. Check that the local runner is running and its configured address is reachable.";
  }
  if (code === "UND_ERR_SOCKET" || code === "ECONNRESET") {
    return "Image runner connection closed before generation completed. Check the runner logs for a restart, crash, or memory failure.";
  }
  return "Image runner connection failed. Check the local runner status and logs.";
}

export async function imageRunnerRejection(response: { status: number; json: () => Promise<unknown> }): Promise<string> {
  if (response.status === 504) {
    return "Image runner stopped generation after its inference deadline and released the generation process. Try fewer steps or a smaller resolution.";
  }
  if (response.status === 500) {
    try {
      const body = await response.json() as { detail?: { code?: unknown } };
      if (body.detail?.code === "out_of_memory") {
        return "Image runner ran out of GPU or system memory. Qwen-Image-Edit-2511 may exceed this host's capacity even with CPU offload; use a host with more memory or fewer/smaller reference images.";
      }
      if (body.detail?.code === "generation_failed") {
        return "Image generation failed. Check the local image runner logs for the failure type and location.";
      }
    } catch {
      // Never expose arbitrary runner error bodies or exception messages.
    }
  }
  if (response.status === 503) {
    return "Image runner is loading or unavailable. Qwen-Image-Edit-2511 may need to download its 57.7 GB model files on first use.";
  }
  if (response.status === 422) {
    try {
      const body = await response.json() as { detail?: unknown };
      if (typeof body.detail === "string") return `Image runner rejected the request: ${body.detail.slice(0, 300)}`;
      if (Array.isArray(body.detail)) {
        const issues = body.detail.slice(0, 5).map((issue) => {
          const item = issue && typeof issue === "object" && !Array.isArray(issue) ? issue as Record<string, unknown> : {};
          const location = Array.isArray(item.loc) ? item.loc.filter((part) => part !== "body" && part !== "form").join(".") : "request";
          return `${location || "request"}: ${String(item.msg ?? "invalid value").slice(0, 120)}`;
        });
        if (issues.length) return `Image runner validation failed: ${issues.join("; ")}`;
      }
    } catch {
      // The runner may return a non-JSON validation error; keep a safe generic summary.
    }
  }
  return `Image runner rejected the request with HTTP ${response.status}.`;
}

