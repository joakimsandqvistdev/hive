import { hostname } from "node:os";
import { and, eq } from "drizzle-orm";
import { setTimeout as delay } from "node:timers/promises";
import { db, pool } from "./db.js";
import { readArtifact, removeArtifact, saveMp4, savePng, saveWav } from "./artifactStore.js";
import { artifacts } from "./schema.js";
import { claimNextRun, failRun, finishCancelledRun, finishRun, finishRunNode, heartbeatRun, runCancellationRequested, setRunNodeRunning, type ClaimedRun } from "./runQueue.js";
import { workflowExecutionOrder } from "./workflowExecutionOrder.js";
import { modelRunnerRejection, modelRunnerTransportFailure } from "./modelRunnerErrors.js";
import { createModelRunnerClient } from "./modelRunnerClient.js";
import { bindModelInputs, buildRunnerInput, object, resolveModelSettings, type NodeOutput, type SnapshotEdge, type SnapshotNode } from "./runInputResolver.js";

const workerId = `${hostname()}:${process.pid}`;
const modelRunnerUrl = (process.env.MODEL_RUNNER_URL ?? process.env.IMAGE_RUNNER_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
const modelRunner = createModelRunnerClient(modelRunnerUrl);

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
    const bound = bindModelInputs(node, edges, outputs, nodeById);
    const resolvedSettings = resolveModelSettings(node);
    const resolved = await setRunNodeRunning(run.id, node.id, workerId, { modelParameters: resolvedSettings.parameters });
    if (!resolved) throw new Error("Worker lease was lost before model execution.");
    const runnerInput = await buildRunnerInput(bound, resolvedSettings.modality, object(resolved.modelParameters), async (artifactId, dataTypeId) => {
      if (signal.aborted) throw new Error("Run cancellation was requested.");
      const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, run.user_id))).limit(1);
      if (!artifact || artifact.dataTypeId !== dataTypeId || (artifact.runId !== null && artifact.runId !== run.id)) throw new Error("Connected file is unavailable.");
      return { ...artifact, readBytes: () => readArtifact(artifact.storageKey) };
    });
    const response = await modelRunner.generate(runnerInput.modality, runnerInput.form, signal);
    if (!response.ok) throw new Error(await modelRunnerRejection(response, runnerInput.modality));
    if (!response.headers.get("content-type")?.toLowerCase().startsWith(runnerInput.mediaType)) throw new Error("Model returned an unsupported output format.");
    if (Number(response.headers.get("content-length") ?? 0) > runnerInput.maxOutputBytes) throw new Error("Model output exceeds the size limit.");
    const bytes = Buffer.from(await response.arrayBuffer().catch((error) => { throw new Error(modelRunnerTransportFailure(error, runnerInput.modality)); }));
    const stored = runnerInput.modality === "video" ? await saveMp4(bytes) : runnerInput.modality === "audio" ? await saveWav(bytes) : await savePng(bytes);
    let inserted = false;
    try {
      await db.insert(artifacts).values({ ...stored, userId: run.user_id, runId: run.id, runNodeId: node.id, dataTypeId: runnerInput.outputDataTypeId, mediaType: runnerInput.mediaType, displayName: `${node.label}.${runnerInput.extension}` }); inserted = true;
      const output = { dataTypeId: runnerInput.outputDataTypeId, artifactId: stored.id };
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

console.log(`Hive worker ${workerId} polling PostgreSQL; model runner: ${modelRunnerUrl}`);
try {
  while (true) {
    const run = await claimNextRun(workerId, 120);
    if (!run) { await delay(1500); continue; }
    await processRun(run);
  }
} finally {
  await modelRunner.close();
  await pool.end();
}
