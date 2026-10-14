import { hostname } from "node:os";
import { FormData } from "undici";
import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { setTimeout as delay } from "node:timers/promises";
import { db, pool } from "./db.js";
import { readArtifact, removeArtifact, saveMp4, savePng, saveWav } from "./artifactStore.js";
import { artifacts } from "./schema.js";
import { imageModelParametersSchema } from "./modelParameters.js";
import { claimNextRun, failRun, finishCancelledRun, finishRun, finishRunNode, heartbeatRun, runCancellationRequested, setRunNodeRunning, type ClaimedRun } from "./runQueue.js";
import { workflowExecutionOrder } from "./workflowExecutionOrder.js";
import { imageRunnerRejection, imageRunnerTransportFailure } from "./imageRunnerErrors.js";
import { createImageRunnerClient } from "./imageRunnerClient.js";
import { videoModelParametersSchema } from "./videoModelParameters.js";
import { audioModelParametersSchema } from "./audioModelParameters.js";

const workerId = `${hostname()}:${process.pid}`;
const runnerUrl = (process.env.IMAGE_RUNNER_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
const imageRunner = createImageRunnerClient(runnerUrl);
const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

type SnapshotNode = {
  id: string; kind: "input" | "model"; label: string; modelId?: string; dataTypeId?: string;
  inputText?: string; artifactId?: string; parameters?: Record<string, unknown>;
  position?: { x?: number; y?: number };
  modelIoContract?: { modality: string; inputs: Array<{ portKey: string; dataTypeId: string; sortOrder: number }>; outputs: Array<{ portKey: string; dataTypeId: string }> };
};
type SnapshotEdge = { source: string; sourceHandle: string; target: string; targetHandle: string };
type NodeOutput = { dataTypeId: string; text?: string; artifactId?: string };
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

async function execute(run: ClaimedRun, signal: AbortSignal): Promise<void> {
  const snapshot = object(run.workflow_snapshot_json);
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes as SnapshotNode[] : [];
  const edges = Array.isArray(snapshot.edges) ? snapshot.edges as SnapshotEdge[] : [];
  if (!nodes.length) throw new Error("Workflow snapshot contains no executable nodes.");
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outputs = new Map<string, NodeOutput>();
  const prior = await pool.query<{ node_id: string; status: string; output_json: NodeOutput }>("SELECT node_id,status,output_json FROM run_nodes WHERE run_id=$1", [run.id]);
  for (const row of prior.rows) if (row.status === "succeeded") outputs.set(row.node_id, row.output_json);
  for (const node of workflowExecutionOrder(nodes, edges)) {
    if (signal.aborted) throw new Error("Run cancellation was requested.");
    if (outputs.has(node.id)) continue;
    if (node.kind === "input") {
      const input = await setRunNodeRunning(run.id, node.id, workerId, {});
      if (!input) throw new Error("Worker lease was lost before input execution.");
      const output: NodeOutput = node.dataTypeId === "text" ? { dataTypeId: "text", text: node.inputText ?? "" } : { dataTypeId: node.dataTypeId ?? "", artifactId: node.artifactId };
      if (output.artifactId) {
        const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, output.artifactId), eq(artifacts.userId, run.user_id))).limit(1);
        if (!artifact || artifact.dataTypeId !== output.dataTypeId || artifact.runId !== null) throw new Error("Uploaded input is unavailable.");
        await readArtifact(artifact.storageKey);
      }
      if (!await finishRunNode(run.id, node.id, workerId, output)) throw new Error("Worker lease was lost after input execution.");
      outputs.set(node.id, output); continue;
    }
    const contract = node.modelIoContract;
    if (!contract) throw new Error("Model input/output contract is missing.");
    const incoming = edges.filter((edge) => edge.target === node.id).sort((a, b) => {
      const order = (key: string) => contract.inputs.find((port) => port.portKey === key)?.sortOrder ?? 0;
      const left = nodeById.get(a.source)?.position ?? {}, right = nodeById.get(b.source)?.position ?? {};
      return order(a.targetHandle)-order(b.targetHandle) || (left.y ?? 0)-(right.y ?? 0) || (left.x ?? 0)-(right.x ?? 0) || a.source.localeCompare(b.source);
    });
    const bound = incoming.map((edge) => {
      const output = outputs.get(edge.source);
      const port = contract.inputs.find((input) => input.portKey === edge.targetHandle);
      if (!output || !port || output.dataTypeId !== port.dataTypeId) throw new Error("Connected node output does not match the model input datatype.");
      return { port, output };
    });
    const prompt = bound.find((input) => input.port.portKey === "prompt")?.output.text?.trim();
    if (!prompt) throw new Error("Connect a nonempty text input to the model prompt port.");
    const video = contract.modality === "video";
    const audio = contract.modality === "audio";
    const parameterSchema = video ? videoModelParametersSchema : audio ? audioModelParametersSchema : imageModelParametersSchema;
    const parsed = parameterSchema.safeParse({ ...node.parameters, modelId: node.modelId });
    if (!parsed.success) throw new Error("Model settings are invalid. Edit and save the workflow again.");
    const configured = parsed.data;
    let candidate: Record<string, unknown>;
    if (audio) candidate = configured;
    else {
      if (!("resolution" in configured) || !("seed" in configured) || !("randomizeSeed" in configured)) throw new Error("Model settings are invalid. Edit and save the workflow again.");
      const [width, height] = configured.resolution.split("x").map(Number);
      candidate = { ...configured, width, height, seed: configured.randomizeSeed ? randomInt(0, 2_147_483_648) : configured.seed };
    }
    const resolved = await setRunNodeRunning(run.id, node.id, workerId, { modelParameters: candidate });
    if (!resolved) throw new Error("Worker lease was lost before model execution.");
    const settings = object(resolved.modelParameters);
    const form = new FormData();
    form.set("model_id", String(settings.modelId)); form.set("prompt", prompt);
    if (audio) {
      form.set("voice", String(settings.voice)); form.set("speed", String(settings.speed));
    } else {
      form.set("seed", String(settings.seed)); form.set("num_inference_steps", String(settings.steps));
      form.set("width", String(settings.width)); form.set("height", String(settings.height));
    }
    if (video) {
      form.set("frames", String(settings.frames)); form.set("fps", String(settings.fps));
      form.set("guidance_scale", String(settings.guidanceScale)); form.set("negative_prompt", bound.find((input) => input.port.portKey === "negative_prompt")?.output.text ?? "");
    } else if (!audio) {
      for (const [key, field] of [["trueCfgScale", "true_cfg_scale"], ["imageGuidanceScale", "image_guidance_scale"], ["guidanceScale", "guidance_scale"], ["strength", "strength"]]) form.set(field!, String(settings[key!]));
    }
    let referenceBytes = 0;
    for (const input of bound.filter((input) => input.output.dataTypeId !== "text")) {
      if (signal.aborted) throw new Error("Run cancellation was requested.");
      const artifactId = input.output.artifactId;
      if (!artifactId) throw new Error("Connected input did not produce a file.");
      const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, run.user_id))).limit(1);
      if (!artifact || artifact.dataTypeId !== input.output.dataTypeId || (artifact.runId !== null && artifact.runId !== run.id)) throw new Error("Connected file is unavailable.");
      referenceBytes += artifact.byteSize;
      if (artifact.byteSize > 10*1024*1024 || referenceBytes > 25*1024*1024) throw new Error("Image references exceed their size limits.");
      const bytes = await readArtifact(artifact.storageKey);
      const buffer = new ArrayBuffer(bytes.length); new Uint8Array(buffer).set(bytes);
      form.append("images", new Blob([buffer], { type: artifact.mediaType }), artifact.displayName);
    }
    const response = video ? await imageRunner.generateVideo(form, signal) : audio ? await imageRunner.generateAudio(form, signal) : await imageRunner.generate(form, signal);
    if (!response.ok) throw new Error(await imageRunnerRejection(response, audio ? "Audio" : video ? "Video" : "Image"));
    const mediaType = video ? "video/mp4" : audio ? "audio/wav" : "image/png";
    if (!response.headers.get("content-type")?.toLowerCase().startsWith(mediaType)) throw new Error("Model returned an unsupported output format.");
    if (Number(response.headers.get("content-length") ?? 0) > (video ? MAX_VIDEO_BYTES : audio ? MAX_AUDIO_BYTES : MAX_OUTPUT_BYTES)) throw new Error("Model output exceeds the size limit.");
    const bytes = Buffer.from(await response.arrayBuffer().catch((error) => { throw new Error(imageRunnerTransportFailure(error, audio ? "Audio" : video ? "Video" : "Image")); }));
    const stored = video ? await saveMp4(bytes) : audio ? await saveWav(bytes) : await savePng(bytes);
    let inserted = false;
    try {
      const dataTypeId = video ? "video" : audio ? "audio" : "image";
      await db.insert(artifacts).values({ ...stored, userId: run.user_id, runId: run.id, runNodeId: node.id, dataTypeId, mediaType, displayName: `${node.label}.${video ? "mp4" : audio ? "wav" : "png"}` }); inserted = true;
      const output = { dataTypeId, artifactId: stored.id };
      if (!await finishRunNode(run.id, node.id, workerId, output)) throw new Error("Worker lease was lost after model execution.");
      outputs.set(node.id, output);
    } catch (error) { if (inserted) await db.delete(artifacts).where(eq(artifacts.id, stored.id)); await removeArtifact(stored.storageKey); throw error; }
  }
  await finishRun(run.id, workerId);
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
