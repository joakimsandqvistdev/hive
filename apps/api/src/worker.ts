import { hostname } from "node:os";
import { eq } from "drizzle-orm";
import { setTimeout as delay } from "node:timers/promises";
import { db, pool } from "./db.js";
import { removeArtifact, savePng } from "./artifactStore.js";
import { artifacts } from "./schema.js";
import { claimNextRun, failRun, finishRun, finishRunNode, heartbeatRun, setRunNodeRunning, type ClaimedRun } from "./runQueue.js";

const workerId = `${hostname()}:${process.pid}`;
const runnerUrl = (process.env.ZIMAGE_RUNNER_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
const MAX_OUTPUT_BYTES = 25 * 1024 * 1024;

type SnapshotNode = {
  id: string;
  prompt?: string;
  instructions?: string;
  agent?: { name?: string; modality?: string; prompt?: string; description?: string };
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function execute(run: ClaimedRun, signal: AbortSignal): Promise<void> {
  const snapshot = object(run.workflow_snapshot_json);
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes as SnapshotNode[] : [];
  const edges = Array.isArray(snapshot.edges) ? snapshot.edges : [];
  if (!nodes.length) throw new Error("Workflow snapshot contains no executable nodes.");
  if (edges.length) throw new Error("Connected workflow nodes are not supported by the current image runner.");

  for (const node of nodes) {
    const existing = await pool.query<{ status: string }>("SELECT status FROM run_nodes WHERE run_id=$1 AND node_id=$2", [run.id, node.id]);
    if (existing.rows[0]?.status === "succeeded") continue;
    if (!await setRunNodeRunning(run.id, node.id, workerId)) throw new Error("Worker lease was lost before node execution.");
    const modality = node.agent?.modality;
    if (modality !== "image") throw new Error(`Node “${node.agent?.name ?? node.id}” uses ${String(modality ?? "an unknown modality")}; this worker currently supports image agents only.`);
    const prompt = (node.prompt ?? node.instructions ?? "").trim();
    if (!prompt) throw new Error("The workflow-node prompt is empty.");

    const response = await fetch(`${runnerUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, width: 512, height: 512 }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(20 * 60 * 1000)]),
    });
    if (!response.ok) throw new Error(response.status === 503 ? "Image runner is still loading or unavailable." : `Image runner returned HTTP ${response.status}.`);
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
        artifactId: stored.id, mediaType: "image/png", byteSize: stored.byteSize, checksum: stored.checksum,
      });
      if (!saved) throw new Error("Worker lease was lost while saving node output.");
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
