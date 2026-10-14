import { Router } from "express";

const router = Router();
const runnerUrl = (process.env.IMAGE_RUNNER_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
const modelIds = new Set(["z-image-turbo", "qwen-image-edit-2511", "instruct-pix2pix", "sd15-inpainting", "longcat-image-edit-turbo", "flux2-klein-4b", "sd15-base", "sdxl-base-1.0", "sd35-medium", "sdxl-turbo", "sana-sprint-06b"]);

export async function forwardRunnerRequest(path: string, method = "GET", timeoutMs = 15_000) {
  const response = await fetch(`${runnerUrl}${path}`, { method, signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

router.get("/", async (_req, res) => {
  try {
    const { response, body } = await forwardRunnerRequest("/models");
    if (!response.ok) { res.status(502).json({ error: "model_runner_unavailable" }); return; }
    res.json(body);
  } catch {
    res.status(503).json({ error: "model_runner_unavailable" });
  }
});

router.post("/:id/download", async (req, res) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) {
    res.status(403).json({ error: "invalid_origin" });
    return;
  }
  if (!modelIds.has(req.params.id)) { res.status(404).json({ error: "unknown_model" }); return; }
  try {
    const { response, body } = await forwardRunnerRequest(`/models/${req.params.id}/download`, "POST");
    res.status(response.status).json(body);
  } catch {
    res.status(503).json({ error: "model_runner_unavailable" });
  }
});

router.delete("/:id/download", async (req, res) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) {
    res.status(403).json({ error: "invalid_origin" });
    return;
  }
  if (!modelIds.has(req.params.id)) { res.status(404).json({ error: "unknown_model" }); return; }
  try {
    const { response, body } = await forwardRunnerRequest(`/models/${req.params.id}/download`, "DELETE", 180_000);
    res.status(response.status).json(body);
  } catch {
    res.status(503).json({ error: "model_runner_unavailable" });
  }
});

export const modelsRouter = router;
