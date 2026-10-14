import { hostname } from "node:os";
import { FormData, type Response } from "undici";
import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { setTimeout as delay } from "node:timers/promises";
import { db, pool } from "./db.js";
import { readArtifact, removeArtifact, saveMp4, savePng } from "./artifactStore.js";
import { artifacts } from "./schema.js";
import { defaultImageModelParameters, dimensionsForResolution, imageModelParametersSchema } from "./modelParameters.js";
import { claimNextRun, failRun, finishCancelledRun, finishRun, finishRunNode, heartbeatRun, runCancellationRequested, setRunNodeRunning, type ClaimedRun } from "./runQueue.js";
import { workflowExecutionOrder } from "./workflowExecutionOrder.js";
import { imageRunnerRejection, imageRunnerTransportFailure } from "./imageRunnerErrors.js";
import { createImageRunnerClient } from "./imageRunnerClient.js";
import { defaultVideoModelParameters, videoModelParametersSchema } from "./videoModelParameters.js";

const workerId = `${hostname()}:${process.pid}`;
const runnerUrl = (process.env.IMAGE_RUNNER_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
const imageRunner = createImageRunnerClient(runnerUrl);
const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

type SnapshotNode = {
  id: string;
  prompt?: string;
  instructions?: string;
  parameters?: Record<string, unknown>;
  position?: { x?: number; y?: number };
  agent?: { name?: string; modality?: string; prompt?: string; description?: string; parameters?: Record<string, unknown> };
};
type SnapshotEdge = { source: string; target: string; targetHandle?: string | null };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function videoRunnerRejection(response: Response): Promise<string> {
  const message = await imageRunnerRejection(response);
  if (message.includes("ran out of GPU or system memory")) return "Video runner ran out of GPU or system memory. Try a shorter clip or a host with more memory.";
  return message.replaceAll("Image runner", "Video runner").replaceAll("image runner", "video runner").replaceAll("Image generation", "Video generation");
}

async function executeVideoNode(run: ClaimedRun, node: SnapshotNode, signal: AbortSignal, prompt: string): Promise<string> {
  const rawParameters = { ...object(node.agent?.parameters), ...object(node.parameters) };
  const parsed = videoModelParametersSchema.safeParse(rawParameters);
  if (!parsed.success) throw new Error("Video agent settings are invalid. Edit the agent and save the workflow again.");
  const configured = parsed.data;
  const candidate = {
    ...configured,
    seed: configured.randomizeSeed ? randomInt(0, 2_147_483_648) : configured.seed,
  };
  const resolvedInput = await setRunNodeRunning(run.id, node.id, workerId, { modelParameters: candidate });
  if (!resolvedInput) throw new Error("Worker lease was lost before node execution.");
  const saved = object(resolvedInput.modelParameters);
  const settings = Object.keys(saved).length ? saved : candidate;
  const form = new FormData();
  form.set("model_id", String(settings.modelId ?? configured.modelId));
  form.set("prompt", prompt);
  form.set("negative_prompt", String(settings.negativePrompt ?? ""));
  form.set("frames", String(settings.frames ?? configured.frames));
  form.set("seed", String(settings.seed ?? configured.seed));
  form.set("num_inference_steps", String(settings.steps ?? configured.steps));
  form.set("guidance_scale", String(settings.guidanceScale ?? configured.guidanceScale));

  const response = await imageRunner.generateVideo(form, signal);
  if (!response.ok) throw new Error(await videoRunnerRejection(response));
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("video/mp4")) throw new Error("Video runner did not return an MP4 video.");
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_VIDEO_BYTES) throw new Error("Video output exceeds the 50 MB limit.");
  const bytes = Buffer.from(await response.arrayBuffer());
  const stored = await saveMp4(bytes);
  let metadataInserted = false;
  try {
    await db.insert(artifacts).values({
      id: stored.id, userId: run.user_id, runId: run.id, runNodeId: node.id,
      storageKey: stored.storageKey, mediaType: "video/mp4", byteSize: stored.byteSize,
      checksum: stored.checksum, displayName: `${node.agent?.name ?? "generated-video"}.mp4`,
    });
    metadataInserted = true;
    const finished = await finishRunNode(run.id, node.id, workerId, {
      artifactId: stored.id, mediaType: "video/mp4", byteSize: stored.byteSize, checksum: stored.checksum, modelParameters: settings,
    });
    if (!finished) throw new Error("Worker lease was lost while saving node output.");
  } catch (error) {
    if (metadataInserted) await db.delete(artifacts).where(eq(artifacts.id, stored.id));
    await removeArtifact(stored.storageKey);
    throw error;
  }
  return stored.id;
}

async function execute(run: ClaimedRun, signal: AbortSignal): Promise<void> {
  const snapshot = object(run.workflow_snapshot_json);
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes as SnapshotNode[] : [];
  const edges = Array.isArray(snapshot.edges) ? snapshot.edges as SnapshotEdge[] : [];
  if (!nodes.length) throw new Error("Workflow snapshot contains no executable nodes.");

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, [] as Array<{ source: string; role: string }>]));
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) throw new Error("Workflow contains a connection to a missing node.");
    incoming.get(edge.target)!.push({ source: edge.source, role: edge.targetHandle ?? "image" });
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
    if (signal.aborted) throw new Error("Run cancellation was requested.");
    const existing = await pool.query<{ status: string }>("SELECT status FROM run_nodes WHERE run_id=$1 AND node_id=$2", [run.id, node.id]);
    if (existing.rows[0]?.status === "succeeded") continue;
    const modality = node.agent?.modality;
    const prompt = (node.prompt ?? node.instructions ?? "").trim();
    if (!prompt) throw new Error("The workflow-node prompt is empty.");
    if (modality === "video") {
      artifactIdByNode.set(node.id, await executeVideoNode(run, node, signal, prompt));
      continue;
    }
    if (modality !== "image") throw new Error(`Node “${node.agent?.name ?? node.id}” uses an unsupported modality.`);
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
      imageGuidanceScale: configuredParameters.imageGuidanceScale,
      strength: configuredParameters.strength,
      guidanceScale: configuredParameters.guidanceScale,
    };
    const resolvedInput = await setRunNodeRunning(run.id, node.id, workerId, { modelParameters: candidateSettings });
    if (!resolvedInput) throw new Error("Worker lease was lost before node execution.");
    const modelParameters = object(resolvedInput.modelParameters);
    const settings = Object.keys(modelParameters).length ? modelParameters : candidateSettings;
    const sourceInputs = [...(incoming.get(node.id) ?? [])].sort((leftInput, rightInput) => {
      const left = nodeById.get(leftInput.source)?.position ?? {};
      const right = nodeById.get(rightInput.source)?.position ?? {};
      return leftInput.role.localeCompare(rightInput.role) || (left.y ?? 0) - (right.y ?? 0) || (left.x ?? 0) - (right.x ?? 0) || leftInput.source.localeCompare(rightInput.source);
    });
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
    form.set("image_guidance_scale", String(settings.imageGuidanceScale ?? configuredParameters.imageGuidanceScale));
    form.set("strength", String(settings.strength ?? configuredParameters.strength));
    form.set("guidance_scale", String(settings.guidanceScale ?? configuredParameters.guidanceScale));
    if (configuredParameters.modelId === "sd15-inpainting") {
      for (const requiredRole of ["image", "mask"]) if (!sourceInputs.some((input) => input.role === requiredRole)) throw new Error("Stable Diffusion Inpainting needs a source image and a mask connection.");
      if (sourceInputs.some((input) => !["image", "mask"].includes(input.role))) throw new Error("Stable Diffusion Inpainting accepts only Image and Mask connections.");
    }
    let referenceTotalBytes = 0;
    for (const { source: sourceNodeId } of sourceInputs) {
      if (signal.aborted) throw new Error("Run cancellation was requested.");
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

    const response = await imageRunner.generate(form, signal);
    if (!response.ok) throw new Error(await imageRunnerRejection(response));
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("image/png")) throw new Error("Image runner did not return a PNG image.");
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_OUTPUT_BYTES) throw new Error("Image runner output exceeds the 25 MB limit.");
    const bytes = Buffer.from(await response.arrayBuffer().catch((error) => {
      throw new Error(imageRunnerTransportFailure(error), { cause: error });
    }));
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
  if (!await finishRun(run.id, workerId) && await runCancellationRequested(run.id, workerId)) {
    throw new Error("Run cancellation was requested.");
  }
}

async function processRun(run: ClaimedRun): Promise<void> {
  let leaseLost = false;
  let cancellationRequested = false;
  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    void (async () => {
      const alive = await heartbeatRun(run.id, workerId);
      if (!alive) {
        cancellationRequested = await runCancellationRequested(run.id, workerId);
        leaseLost = !cancellationRequested;
        controller.abort();
        return;
      }
      if (await runCancellationRequested(run.id, workerId)) {
        cancellationRequested = true;
        controller.abort();
      }
    })().catch(() => { leaseLost = true; controller.abort(); });
  }, 1000);
  try {
    await execute(run, controller.signal);
  } catch (error) {
    if (leaseLost) return;
    if (cancellationRequested || await runCancellationRequested(run.id, workerId)) {
      await finishCancelledRun(run.id, workerId);
      return;
    }
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
  await imageRunner.close();
  await pool.end();
}
