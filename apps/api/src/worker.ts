import { hostname } from "node:os";
import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { setTimeout as delay } from "node:timers/promises";
import { db, pool } from "./db.js";
import { readArtifact, removeArtifact, savePng } from "./artifactStore.js";
import { artifacts } from "./schema.js";
import { defaultImageModelParameters, dimensionsForResolution, imageModelParametersSchema } from "./modelParameters.js";
import { claimNextRun, failRun, finishRun, finishRunNode, heartbeatRun, setRunNodeRunning, type ClaimedRun } from "./runQueue.js";
import { workflowExecutionOrder } from "./workflowExecutionOrder.js";

const workerId = `${hostname()}:${process.pid}`;
const runnerUrl = (process.env.ZIMAGE_RUNNER_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;

async function imageRunnerRejection(response: Response): Promise<string> {
  if (response.status === 503) {
    return "Image runner is loading or unavailable. Qwen-Image-Edit-2511 may need to download its 57.7 GB model files on first use.";
  }
  if (response.status === 422) {
    try {
      const body = await response.json() as { detail?: unknown };
      if (typeof body.detail === "string") return `Image runner rejected the request: ${body.detail.slice(0, 300)}`;
      if (Array.isArray(body.detail)) {
        const issues = body.detail.slice(0, 5).map((issue) => {
          const item = object(issue);
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

type SnapshotNode = {
  id: string;
  prompt?: string;
  instructions?: string;
  parameters?: Record<string, unknown>;
  position?: { x?: number; y?: number };
  agent?: { name?: string; modality?: string; prompt?: string; description?: string; parameters?: Record<string, unknown> };
};
type SnapshotEdge = { source: string; target: string };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function execute(run: ClaimedRun, signal: AbortSignal): Promise<void> {
  const snapshot = object(run.workflow_snapshot_json);
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes as SnapshotNode[] : [];
  const edges = Array.isArray(snapshot.edges) ? snapshot.edges as SnapshotEdge[] : [];
  if (!nodes.length) throw new Error("Workflow snapshot contains no executable nodes.");

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) throw new Error("Workflow contains a connection to a missing node.");
    incoming.get(edge.target)!.push(edge.source);
  }
  const orderedNodes = workflowExecutionOrder(nodes, edges);
  const artifactIdByNode = new Map<string, string>();
  const priorNodeRows = await pool.query<{ node_id: string; status: string; output_json: Record<string, unknown> | null }>(
    "SELECT node_id,status,output_json FROM run_nodes WHERE run_id=$1", [run.id],
  );
  for (const prior of priorNodeRows.rows) {
    const artifactId = object(prior.output_json).artifactId;
    if (prior.status === "succeeded" && typeof artifactId === "string") artifactIdByNode.set(prior.node_id, artifactId);
  }

  for (const node of orderedNodes) {
    const existing = await pool.query<{ status: string }>("SELECT status FROM run_nodes WHERE run_id=$1 AND node_id=$2", [run.id, node.id]);
    if (existing.rows[0]?.status === "succeeded") continue;
    const modality = node.agent?.modality;
    if (modality !== "image") throw new Error(`Node “${node.agent?.name ?? node.id}” uses ${String(modality ?? "an unknown modality")}; this worker currently supports image agents only.`);
    const rawParameters = { ...object(node.agent?.parameters), ...object(node.parameters) };
    const parsedParameters = imageModelParametersSchema.safeParse(rawParameters);
    const configuredParameters = parsedParameters.success ? parsedParameters.data : defaultImageModelParameters;
    const dimensions = dimensionsForResolution(configuredParameters.resolution);
    const candidateSettings = {
      modelId: configuredParameters.modelId,
      ...dimensions,
      resolution: configuredParameters.resolution,
      seed: configuredParameters.randomizeSeed ? randomInt(0, 2_147_483_648) : configuredParameters.seed,
      randomizeSeed: configuredParameters.randomizeSeed,
      steps: configuredParameters.steps,
      trueCfgScale: configuredParameters.trueCfgScale,
    };
    const resolvedInput = await setRunNodeRunning(run.id, node.id, workerId, { modelParameters: candidateSettings });
    if (!resolvedInput) throw new Error("Worker lease was lost before node execution.");
    const modelParameters = object(resolvedInput.modelParameters);
    const settings = Object.keys(modelParameters).length ? modelParameters : candidateSettings;
    const prompt = (node.prompt ?? node.instructions ?? "").trim();
    if (!prompt) throw new Error("The workflow-node prompt is empty.");
    const sourceNodeIds = [...new Set(incoming.get(node.id) ?? [])].sort((leftId, rightId) => {
      const left = nodeById.get(leftId)?.position ?? {};
      const right = nodeById.get(rightId)?.position ?? {};
      return (left.y ?? 0) - (right.y ?? 0) || (left.x ?? 0) - (right.x ?? 0) || leftId.localeCompare(rightId);
    });
    if (configuredParameters.modelId === "qwen-image-edit-2511" && (sourceNodeIds.length === 0 || sourceNodeIds.length > 10)) {
      throw new Error("Qwen-Image-Edit-2511 needs 1–10 connected image-node references.");
    }
    if (configuredParameters.modelId === "z-image-turbo" && sourceNodeIds.length > 0) {
      throw new Error("Connected image references currently require Qwen-Image-Edit-2511 on the receiving node.");
    }

    const modelId = String(settings.modelId ?? configuredParameters.modelId);
    const trueCfgScale = Number(settings.trueCfgScale ?? configuredParameters.trueCfgScale);
    const form = new FormData();
    form.set("model_id", modelId);
    form.set("prompt", prompt);
    form.set("width", String(settings.width));
    form.set("height", String(settings.height));
    form.set("seed", String(settings.seed));
    form.set("num_inference_steps", String(settings.steps));
    form.set("true_cfg_scale", String(trueCfgScale));
    let referenceTotalBytes = 0;
    for (const sourceNodeId of sourceNodeIds) {
      const artifactId = artifactIdByNode.get(sourceNodeId);
      if (!artifactId) throw new Error("A connected reference node did not produce an image.");
      const [artifact] = await db.select({ storageKey: artifacts.storageKey, byteSize: artifacts.byteSize }).from(artifacts)
        .where(and(eq(artifacts.id, artifactId), eq(artifacts.runId, run.id), eq(artifacts.userId, run.user_id))).limit(1);
      if (!artifact) throw new Error("A connected reference image is unavailable.");
      referenceTotalBytes += artifact.byteSize;
      if (artifact.byteSize > 10 * 1024 * 1024 || referenceTotalBytes > 25 * 1024 * 1024) {
        throw new Error("Connected reference images exceed the 25 MB total limit (10 MB each).");
      }
      const bytes = await readArtifact(artifact.storageKey);
      const imageBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(imageBuffer).set(bytes);
      form.append("images", new Blob([imageBuffer], { type: "image/png" }), `${sourceNodeId}.png`);
    }

    const response = await fetch(`${runnerUrl}/generate`, {
      method: "POST",
      body: form,
      signal: AbortSignal.any([signal, AbortSignal.timeout(60 * 60 * 1000)]),
    });
    if (!response.ok) throw new Error(await imageRunnerRejection(response));
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("image/png")) throw new Error("Image runner did not return a PNG image.");
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_OUTPUT_BYTES) throw new Error("Image runner output exceeds the 25 MB limit.");
    const bytes = Buffer.from(await response.arrayBuffer());
    const stored = await savePng(bytes);
    let metadataInserted = false;
    try {
      await db.insert(artifacts).values({
        id: stored.id, userId: run.user_id, runId: run.id, runNodeId: node.id,
        storageKey: stored.storageKey, mediaType: "image/png", byteSize: stored.byteSize,
        checksum: stored.checksum, displayName: `${node.agent?.name ?? "generated-image"}.png`,
      });
      metadataInserted = true;
      const saved = await finishRunNode(run.id, node.id, workerId, {
        artifactId: stored.id, mediaType: "image/png", byteSize: stored.byteSize, checksum: stored.checksum, modelParameters: settings,
      });
      if (!saved) throw new Error("Worker lease was lost while saving node output.");
      artifactIdByNode.set(node.id, stored.id);
    } catch (error) {
      if (metadataInserted) await db.delete(artifacts).where(eq(artifacts.id, stored.id));
      await removeArtifact(stored.storageKey);
      throw error;
    }
  }
  await finishRun(run.id, workerId);
}

async function processRun(run: ClaimedRun): Promise<void> {
  let leaseLost = false;
  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    void heartbeatRun(run.id, workerId).then((alive) => { if (!alive) { leaseLost = true; controller.abort(); } }).catch(() => { leaseLost = true; controller.abort(); });
  }, 30_000);
  try {
    await execute(run, controller.signal);
  } catch (error) {
    if (leaseLost) return;
    const message = error instanceof Error ? error.message : "Run execution failed.";
    const unsupported = /not supported|unknown modality/i.test(message);
    await failRun(run.id, workerId, unsupported ? "unsupported_node" : "execution_failed", message);
  } finally {
    clearInterval(heartbeat);
  }
}

console.log(`Hive worker ${workerId} polling PostgreSQL; image runner: ${runnerUrl}`);
try {
  while (true) {
    const run = await claimNextRun(workerId, 120);
    if (!run) { await delay(1500); continue; }
    await processRun(run);
  }
} finally {
  await pool.end();
}
