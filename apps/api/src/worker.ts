import { hostname } from "node:os";
import { and, eq, inArray } from "drizzle-orm";
import { setTimeout as delay } from "node:timers/promises";
import { db, pool } from "./db.js";
import { readArtifact, removeArtifact, saveJpeg, saveMp4, savePng, saveWav } from "./artifactStore.js";
import { artifacts, instagramAccounts, instagramPublicationMedia, instagramPublications, runs } from "./schema.js";
import { claimNextRun, failRun, finishCancelledRun, finishRun, finishRunNode, hasQueuedModelUse, heartbeatRun, runCancellationRequested, setRunNodeRunning, type ClaimedRun } from "./runQueue.js";
import { workflowExecutionOrder } from "./workflowExecutionOrder.js";
import { modelRunnerRejection, modelRunnerTransportFailure } from "./modelRunnerErrors.js";
import { createModelRunnerClient } from "./modelRunnerClient.js";
import { bindModelInputs, buildRunnerInput, object, resolveModelSettings, type NodeOutput, type SnapshotEdge, type SnapshotNode } from "./runInputResolver.js";
import { processWorkflowJobTick } from "./workflowJobScheduler.js";
import { parseTextOverlaySettings, stillImageVideoSettingsSchema } from "./processingNodes.js";
import { renderTextOverlay } from "./textOverlayRenderer.js";
import { renderStillImageVideo } from "./stillImageVideo.js";
import { instagramMediaUrl, usableInstagramToken } from "./instagram.js";
import { purgeExpiredWebhookDeliveries } from "./webhookTriggers.js";
import sharp from "sharp";

const workerId = `${hostname()}:${process.pid}`;
const modelRunnerUrl = (process.env.MODEL_RUNNER_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
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
    if (!contract) throw new Error("Node input/output contract is missing.");
    const bound = bindModelInputs(node, edges, outputs, nodeById);
    if (node.kind === "publishing") {
      const settings = node.parameters ?? {};
      const mediaPort = settings.operationId === "instagram-reel" ? "video" : "image";
      const media = bound.find((input) => input.port.portKey === mediaPort)?.output;
      const caption = bound.find((input) => input.port.portKey === "caption")?.output.text;
      if (!media?.artifactId || typeof caption !== "string") throw new Error("Connect media and a text caption to the Instagram publishing node.");
      const [account] = await db.select().from(instagramAccounts).where(and(eq(instagramAccounts.id, String(settings.accountId)), eq(instagramAccounts.userId, run.user_id))).limit(1);
      if (!account) throw new Error("The Instagram account connected to this node is no longer available.");
      let [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, media.artifactId), eq(artifacts.userId, run.user_id))).limit(1);
      const expectedType = mediaPort === "video" ? "video" : "image";
      if (!artifact || artifact.dataTypeId !== expectedType || (artifact.runId !== null && artifact.runId !== run.id)) throw new Error("Connected publishing media is unavailable.");
      if (mediaPort === "image" && artifact.mediaType !== "image/jpeg") {
        const jpeg = await saveJpeg(await sharp(await readArtifact(artifact.storageKey)).jpeg({ quality: 92, mozjpeg: true }).toBuffer());
        try {
          [artifact] = await db.insert(artifacts).values({ ...jpeg, userId: run.user_id, runId: run.id, runNodeId: node.id, dataTypeId: "image", mediaType: "image/jpeg", displayName: `${node.label}.jpg` }).returning();
        } catch (error) { await removeArtifact(jpeg.storageKey); throw error; }
      }
      const step = await setRunNodeRunning(run.id, node.id, workerId, { accountId: account.id, mediaArtifactId: artifact.id });
      if (!step) throw new Error("Worker lease was lost before publication was queued.");
      await db.insert(instagramPublications).values({ userId: run.user_id, runId: run.id, nodeId: node.id, accountId: account.id, artifactId: artifact.id, mediaKind: mediaPort, mode: settings.mode === "automatic" ? "automatic" : "manual", shareToFeed: settings.shareToFeed !== false, status: settings.mode === "automatic" ? "queued" : "awaiting_review", caption: caption.slice(0, 2200) }).onConflictDoNothing();
      if (!await finishRunNode(run.id, node.id, workerId, { status: settings.mode === "automatic" ? "queued" : "awaiting_review" })) throw new Error("Worker lease was lost after publication was queued.");
      outputs.set(node.id, { dataTypeId: "text", text: "" });
      continue;
    }
    if (node.kind === "processing") {
      if (node.parameters?.operationId === "still-image-video") {
        const settings = stillImageVideoSettingsSchema.parse(node.parameters);
        const imageId = bound.find((input) => input.port.portKey === "image")?.output.artifactId;
        const audioId = bound.find((input) => input.port.portKey === "audio")?.output.artifactId;
        if (!imageId) throw new Error("Connect an image to Still Image Video.");
        const [image] = await db.select().from(artifacts).where(and(eq(artifacts.id, imageId), eq(artifacts.userId, run.user_id))).limit(1);
        const [audio] = audioId ? await db.select().from(artifacts).where(and(eq(artifacts.id, audioId), eq(artifacts.userId, run.user_id))).limit(1) : [undefined];
        if (!image || image.dataTypeId !== "image" || (image.runId !== null && image.runId !== run.id) || (audioId && (!audio || audio.dataTypeId !== "audio" || (audio.runId !== null && audio.runId !== run.id)))) throw new Error("Connected image or audio is unavailable.");
        const processing = await setRunNodeRunning(run.id, node.id, workerId, { settings });
        if (!processing) throw new Error("Worker lease was lost before video processing.");
        const bytes = await renderStillImageVideo({ storageKey: image.storageKey, mediaType: image.mediaType, bytes: await readArtifact(image.storageKey) }, audio ? { storageKey: audio.storageKey, mediaType: audio.mediaType, bytes: await readArtifact(audio.storageKey) } : undefined, settings, signal);
        const stored = await saveMp4(bytes);
        let inserted = false;
        try {
          await db.insert(artifacts).values({ ...stored, userId: run.user_id, runId: run.id, runNodeId: node.id, dataTypeId: "video", mediaType: "video/mp4", displayName: `${node.label}.mp4` }); inserted = true;
          const output = { dataTypeId: "video", artifactId: stored.id };
          if (!await finishRunNode(run.id, node.id, workerId, output)) throw new Error("Worker lease was lost after video processing.");
          outputs.set(node.id, output);
        } catch (error) { if (inserted) await db.delete(artifacts).where(eq(artifacts.id, stored.id)); await removeArtifact(stored.storageKey); throw error; }
        continue;
      }
      const settings = parseTextOverlaySettings(object(node.parameters));
      const text = bound.find((input) => input.port.portKey === "text")?.output.text;
      const imageId = bound.find((input) => input.port.portKey === "image")?.output.artifactId;
      if (!text?.trim() || !imageId) throw new Error("Connect a text input and image input to Text Overlay.");
      const processing = await setRunNodeRunning(run.id, node.id, workerId, { settings });
      if (!processing) throw new Error("Worker lease was lost before processing.");
      const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, imageId), eq(artifacts.userId, run.user_id))).limit(1);
      if (!artifact || artifact.dataTypeId !== "image" || (artifact.runId !== null && artifact.runId !== run.id)) throw new Error("Connected image is unavailable.");
      const rendered = await renderTextOverlay(await readArtifact(artifact.storageKey), text, settings);
      const stored = await savePng(rendered);
      let inserted = false;
      try {
        await db.insert(artifacts).values({ ...stored, userId: run.user_id, runId: run.id, runNodeId: node.id, dataTypeId: "image", mediaType: "image/png", displayName: `${node.label}.png` }); inserted = true;
        const output = { dataTypeId: "image", artifactId: stored.id };
        if (!await finishRunNode(run.id, node.id, workerId, output)) throw new Error("Worker lease was lost after processing.");
        outputs.set(node.id, output);
      } catch (error) { if (inserted) await db.delete(artifacts).where(eq(artifacts.id, stored.id)); await removeArtifact(stored.storageKey); throw error; }
      continue;
    }
    const resolvedSettings = resolveModelSettings(node);
    const resolved = await setRunNodeRunning(run.id, node.id, workerId, { modelParameters: resolvedSettings.parameters });
    if (!resolved) throw new Error("Worker lease was lost before model execution.");
    const runnerInput = await buildRunnerInput(bound, resolvedSettings.modality, object(resolved.modelParameters), async (artifactId, dataTypeId) => {
      if (signal.aborted) throw new Error("Run cancellation was requested.");
      const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, run.user_id))).limit(1);
      if (!artifact || artifact.dataTypeId !== dataTypeId || (artifact.runId !== null && artifact.runId !== run.id)) throw new Error("Connected file is unavailable.");
      return { ...artifact, readBytes: () => readArtifact(artifact.storageKey) };
    });
    if (runnerInput.modality === "image") {
      const keepModelCached = await hasQueuedModelUse(String(object(resolved.modelParameters).modelId), run.id, node.id);
      runnerInput.form.set("keep_model_cached", String(keepModelCached));
    }
    const response = await modelRunner.generate(runnerInput.modality, runnerInput.form, signal);
    if (!response.ok) throw new Error(await modelRunnerRejection(response, runnerInput.modality));
    if (!response.headers.get("content-type")?.toLowerCase().startsWith(runnerInput.mediaType)) throw new Error("Model returned an unsupported output format.");
    if (Number(response.headers.get("content-length") ?? 0) > runnerInput.maxOutputBytes) throw new Error("Model output exceeds the size limit.");
    const bytes = Buffer.from(await response.arrayBuffer().catch((error) => { throw new Error(modelRunnerTransportFailure(error, runnerInput.modality)); }));
    if (runnerInput.modality === "text") {
      const generatedText = bytes.toString("utf8").trim();
      if (!generatedText) throw new Error("Text model returned empty text.");
      const textSettings = object(resolved.modelParameters);
      const prefix = typeof textSettings.prefix === "string" ? textSettings.prefix : "";
      const suffix = typeof textSettings.suffix === "string" ? textSettings.suffix : "";
      const text = `${prefix}${generatedText}${suffix}`;
      if (Buffer.byteLength(text, "utf8") > 128 * 1024) throw new Error("Text model output with its prefix and suffix exceeds the output limit.");
      const output = { dataTypeId: "text", text };
      if (!await finishRunNode(run.id, node.id, workerId, output)) throw new Error("Worker lease was lost after text generation.");
      outputs.set(node.id, output);
      continue;
    }
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

async function processInstagramPublication(): Promise<boolean> {
  const publication = await db.transaction(async (tx) => {
    const [item] = await tx.select().from(instagramPublications).where(eq(instagramPublications.status, "queued")).orderBy(instagramPublications.createdAt).limit(1).for("update", { skipLocked: true });
    if (!item) return null;
    const [claimed] = await tx.update(instagramPublications).set({ status: "publishing", errorSummary: null, updatedAt: new Date() }).where(eq(instagramPublications.id, item.id)).returning();
    return claimed;
  });
  if (!publication) return false;
  try {
    const [account] = await db.select().from(instagramAccounts).where(and(eq(instagramAccounts.id, publication.accountId), eq(instagramAccounts.userId, publication.userId))).limit(1);
    if (!account) throw new Error("Connected Instagram account is unavailable.");
    const token = await usableInstagramToken(account);
    const graphBase = `https://graph.instagram.com/${process.env.INSTAGRAM_GRAPH_API_VERSION ?? "v22.0"}/${account.instagramUserId}`;
    const mediaItems = await db.select().from(instagramPublicationMedia).where(eq(instagramPublicationMedia.publicationId, publication.id)).orderBy(instagramPublicationMedia.position);
    const mediaIds = mediaItems.length ? mediaItems.map((item) => item.artifactId) : [publication.artifactId];
    let containerId = publication.containerId;
    if (!containerId) {
      const form = new URLSearchParams({ access_token: token });
      if (publication.mediaKind === "video") {
        form.set("caption", publication.caption);
        form.set("media_type", "REELS"); form.set("video_url", instagramMediaUrl(publication.artifactId)); form.set("share_to_feed", String(publication.shareToFeed));
      } else if (mediaIds.length > 1) {
        const childContainerIds: string[] = [];
        for (const item of mediaItems) {
          let childContainerId = item.containerId;
          if (!childContainerId) {
            const childForm = new URLSearchParams({ image_url: instagramMediaUrl(item.artifactId), alt_text: item.altText, is_carousel_item: "true", access_token: token });
            const childResponse = await fetch(`${graphBase}/media`, { method: "POST", body: childForm });
            const child = await childResponse.json() as { id?: string; error?: { message?: string } };
            if (!childResponse.ok || !child.id) throw new Error(child.error?.message ?? "Instagram could not prepare a carousel slide.");
            childContainerId = child.id;
            await db.update(instagramPublicationMedia).set({ containerId: childContainerId }).where(eq(instagramPublicationMedia.id, item.id));
          }
          let childReady = false;
          for (let attempt = 0; attempt < 150; attempt += 1) {
            const statusUrl = `https://graph.instagram.com/${process.env.INSTAGRAM_GRAPH_API_VERSION ?? "v22.0"}/${childContainerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`;
            const childStatusResponse = await fetch(statusUrl);
            const childStatus = await childStatusResponse.json() as { status_code?: string; status?: string; error?: { message?: string } };
            if (!childStatusResponse.ok) throw new Error(childStatus.error?.message ?? "Instagram could not check a carousel slide.");
            if (childStatus.status_code === "FINISHED") { childReady = true; break; }
            if (childStatus.status_code === "ERROR" || childStatus.status_code === "EXPIRED") {
              if (childStatus.status_code === "EXPIRED") await db.update(instagramPublicationMedia).set({ containerId: null }).where(eq(instagramPublicationMedia.id, item.id));
              throw new Error(childStatus.status ?? "Instagram could not process a carousel slide.");
            }
            await delay(2000);
          }
          if (!childReady) throw new Error("Instagram carousel slide processing timed out. Review the draft before retrying.");
          childContainerIds.push(childContainerId);
        }
        form.set("caption", publication.caption);
        form.set("media_type", "CAROUSEL");
        form.set("children", childContainerIds.join(","));
      } else {
        form.set("caption", publication.caption);
        form.set("image_url", instagramMediaUrl(mediaIds[0]!));
        if (mediaItems[0]?.altText) form.set("alt_text", mediaItems[0].altText);
      }
      const response = await fetch(`${graphBase}/media`, { method: "POST", body: form });
      const body = await response.json() as { id?: string; error?: { message?: string } };
      if (!response.ok || !body.id) throw new Error(body.error?.message ?? "Instagram could not create a media container.");
      containerId = body.id;
      await db.update(instagramPublications).set({ containerId, updatedAt: new Date() }).where(eq(instagramPublications.id, publication.id));
    }
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const statusUrl = "https://graph.instagram.com/" + (process.env.INSTAGRAM_GRAPH_API_VERSION ?? "v22.0") + "/" + containerId + "?fields=status_code,status&access_token=" + encodeURIComponent(token);
      const response = await fetch(statusUrl);
      const body = await response.json() as { status_code?: string; status?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Instagram could not check media processing status.");
      if (body.status_code === "FINISHED") { ready = true; break; }
      if (body.status_code === "ERROR" || body.status_code === "EXPIRED") {
        if (body.status_code === "EXPIRED") await db.update(instagramPublications).set({ containerId: null, updatedAt: new Date() }).where(eq(instagramPublications.id, publication.id));
        throw new Error(body.status ?? (publication.mediaKind === "video" ? "Instagram could not process the Reel video." : "Instagram could not process the post image."));
      }
      if (body.status_code === "PUBLISHED") throw new Error("Instagram reports that this media container was already published. Check Instagram before retrying.");
      await delay(2000);
    }
    if (!ready) throw new Error("Instagram " + (publication.mediaKind === "video" ? "video" : "image") + " processing timed out. Review the publication before retrying.");
    const publishForm = new URLSearchParams({ creation_id: containerId!, access_token: token });
    const publishedResponse = await fetch(`${graphBase}/media_publish`, { method: "POST", body: publishForm });
    const published = await publishedResponse.json() as { id?: string; error?: { message?: string } };
    if (!publishedResponse.ok || !published.id) throw new Error(published.error?.message ?? "Instagram did not publish the media.");
    await db.transaction(async (tx) => {
      const publishedAt = new Date();
      await tx.update(instagramPublications).set({ status: "published", instagramMediaId: published.id!, publishedAt, updatedAt: publishedAt }).where(eq(instagramPublications.id, publication.id));
      if (publication.runId) {
        await tx.update(runs).set({ status: "succeeded", finishedAt: publishedAt }).where(and(eq(runs.id, publication.runId), eq(runs.userId, publication.userId), eq(runs.status, "awaiting_publish")));
      }
      const sourcePublicationIds = mediaItems.flatMap((item) => item.sourcePublicationId ? [item.sourcePublicationId] : []);
      if (sourcePublicationIds.length) {
        const sources = await tx.update(instagramPublications).set({ status: "published", instagramMediaId: published.id!, publishedAt, updatedAt: publishedAt }).where(and(inArray(instagramPublications.id, sourcePublicationIds), eq(instagramPublications.userId, publication.userId), eq(instagramPublications.status, "reserved"))).returning({ runId: instagramPublications.runId });
        const sourceRunIds = [...new Set(sources.flatMap((source) => source.runId ? [source.runId] : []))];
        if (sourceRunIds.length) await tx.update(runs).set({ status: "succeeded", finishedAt: publishedAt }).where(and(inArray(runs.id, sourceRunIds), eq(runs.userId, publication.userId), eq(runs.status, "awaiting_publish")));
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Instagram publishing failed.";
    await db.transaction(async (tx) => {
      // Keep the publication in review; Jobs advance based on workflow completion independently.
      await tx.update(instagramPublications).set({ status: "awaiting_review", errorSummary: message, updatedAt: new Date() }).where(eq(instagramPublications.id, publication.id));
    });
  }
  return true;
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
const webhookDeliveryCleanup = setInterval(() => {
  void purgeExpiredWebhookDeliveries().catch((error) => console.error("Webhook delivery cleanup failed", error instanceof Error ? error.name : "UnknownError"));
}, 60 * 60 * 1000);
webhookDeliveryCleanup.unref();
void purgeExpiredWebhookDeliveries().catch((error) => console.error("Webhook delivery cleanup failed", error instanceof Error ? error.name : "UnknownError"));
let jobSchedulerBusy = false;
const jobScheduler = setInterval(() => {
  if (jobSchedulerBusy) return;
  jobSchedulerBusy = true;
  void processWorkflowJobTick().catch((error) => console.error("Workflow job scheduler failed", error instanceof Error ? error.name : "UnknownError")).finally(() => { jobSchedulerBusy = false; });
}, 1000);
jobScheduler.unref();
void processWorkflowJobTick().catch((error) => console.error("Workflow job scheduler failed", error instanceof Error ? error.name : "UnknownError"));
try {
  while (true) {
    if (await processInstagramPublication()) continue;
    const run = await claimNextRun(workerId, 120);
    if (!run) { await delay(1500); continue; }
    await processRun(run);
  }
} finally {
  clearInterval(jobScheduler);
  clearInterval(webhookDeliveryCleanup);
  await modelRunner.close();
  await pool.end();
}
