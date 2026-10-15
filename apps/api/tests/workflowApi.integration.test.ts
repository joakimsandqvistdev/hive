import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { readArtifact, removeArtifact } from "../src/artifactStore.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64");
let received = "";
let stallNext = false, stalled = false, disconnected = false;
const runner = createServer(async (req, res) => {
  if (req.url === "/models") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ models: [{ id: "z-image-turbo", status: "downloaded" }, { id: "qwen-image-edit-2511", status: "downloaded" }, { id: "wan2.1-t2v-1.3b", status: "downloaded" }] })); return; }
  for await (const chunk of req) received += chunk.toString();
  if (stallNext) { stallNext = false; stalled = true; res.on("close", () => { disconnected = true; }); return; }
  if (req.url === "/generate-video") { const video = Buffer.alloc(32); video.write("ftyp", 4); res.setHeader("content-type", "video/mp4"); res.end(video); }
  else { res.setHeader("content-type", "image/png"); res.end(png); }
});
await new Promise<void>((resolve) => runner.listen(0, "127.0.0.1", resolve));
const runnerAddress = runner.address(); assert.ok(runnerAddress && typeof runnerAddress !== "string");
process.env.MODEL_RUNNER_URL = `http://127.0.0.1:${runnerAddress.port}`;
const { db, pool } = await import("../src/db.js");
const { users, artifacts, workflows, runs, runNodes, runDeletions } = await import("../src/schema.js");
const { workflowsRouter } = await import("../src/workflows.js");
const { artifactsRouter } = await import("../src/artifacts.js");
const { runsRouter } = await import("../src/runs.js");
const ownerRows = await db.insert(users).values([1, 2].map((n) => ({ googleSubject: `cutover-test-${crypto.randomUUID()}`, email: `cutover-test-${n}@example.invalid`, emailVerified: true }))).returning();
const owner = ownerRows[0]!.id, other = ownerRows[1]!.id;
const app = express(); app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => { res.locals.userId = req.get("test-user") ?? owner; next(); });
app.use("/api/workflows", workflowsRouter); app.use("/api/artifacts", artifactsRouter); app.use("/api/runs", runsRouter);
const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address(); assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
const origin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const worker = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "apps/api/src/worker.ts"], { cwd: new URL("../../../", import.meta.url), env: process.env, stdio: "ignore" });
async function request(path: string, method = "GET", body?: unknown, user = owner) {
  return fetch(`${base}${path}`, { method, headers: { origin, "test-user": user, "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function upload(user = owner, data = png, type = "image") {
  return fetch(`${base}/api/artifacts/upload?dataTypeId=${type}&name=fixture.png`, { method: "POST", headers: { origin, "test-user": user, "content-type": "application/octet-stream" }, body: data });
}
async function createFlow() { const response = await request("/api/workflows", "POST", { name: "Test flow", description: "" }); assert.equal(response.status, 201); return (await response.json()).workflow.id as string; }
const text = { id: "text", kind: "input", label: "Prompt", dataTypeId: "text", inputText: "Connected prompt fixture", parameters: {}, position: { x: 0, y: 0 } };
const model = { id: "model", kind: "model", label: "Generate", modelId: "z-image-turbo", inputText: "", parameters: { resolution: "256x256", randomizeSeed: false }, position: { x: 300, y: 0 } };
const promptEdge = { id: "edge", source: "text", sourceHandle: "output", target: "model", targetHandle: "prompt" };
async function waitRun(id: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [row] = await db.select().from(runs).where(eq(runs.id, id));
    if (["succeeded", "failed", "cancelled"].includes(row!.status)) return row!;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Test worker did not finish its run.");
}
after(async () => {
  worker.kill();
  await new Promise<void>((resolve) => { if (worker.exitCode !== null) resolve(); else worker.once("exit", () => resolve()); });
  const files = await db.select().from(artifacts).where(inArray(artifacts.userId, [owner, other]));
  await db.delete(workflows).where(inArray(workflows.userId, [owner, other]));
  await db.delete(runs).where(inArray(runs.userId, [owner, other]));
  await db.delete(artifacts).where(inArray(artifacts.userId, [owner, other]));
  await db.delete(users).where(inArray(users.id, [owner, other]));
  for (const file of files) await removeArtifact(file.storageKey);
  await Promise.all([new Promise<void>((resolve) => server.close(() => resolve())), new Promise<void>((resolve) => runner.close(() => resolve()))]); await pool.end();
});

test("uploaded files and workflow definitions enforce ownership and content types", async () => {
  const response = await upload(); assert.equal(response.status, 201); const file = (await response.json()).artifact;
  assert.equal((await request(`/api/artifacts/${file.id}/preview`, "GET", undefined, other)).status, 404);
  assert.equal((await upload(owner, Buffer.from("<svg></svg>"))).status, 400);
  const id = await createFlow();
  const input = { id: "image", kind: "input", label: "Image", dataTypeId: "image", inputText: "", parameters: {}, artifactId: file.id, position: { x: 0, y: 0 } };
  assert.equal((await request(`/api/workflows/${id}`, "PUT", { name: "Flow", description: "", definition: { nodes: [input], edges: [] } })).status, 200);
  assert.equal((await request(`/api/artifacts/${file.id}`, "DELETE")).status, 409);
  const strangerFile = (await (await upload(other)).json()).artifact;
  assert.equal((await request(`/api/workflows/${id}`, "PUT", { name: "Flow", description: "", definition: { nodes: [{ ...input, artifactId: strangerFile.id }], edges: [] } })).status, 400);
  assert.equal((await request(`/api/workflows/${id}`, "GET", undefined, other)).status, 404);
  const started = await request(`/api/workflows/${id}/runs`, "POST", {}); assert.equal(started.status, 202);
  assert.equal((await waitRun((await started.json()).run.id)).status, "succeeded");
  const unused = (await (await upload()).json()).artifact;
  assert.equal((await request(`/api/artifacts/${unused.id}`, "DELETE")).status, 204);
});
test("connected text executes a downloaded model via mock inference and snapshots node definitions", async () => {
  const id = await createFlow();
  const definition = { nodes: [text, model], edges: [promptEdge] };
  assert.equal((await request(`/api/workflows/${id}`, "PUT", { name: "Flow", description: "", definition })).status, 200);
  const loaded = await (await request(`/api/workflows/${id}`)).json(); assert.equal(loaded.definition.edges[0].sourceHandle, "output");
  const started = await request(`/api/workflows/${id}/runs`, "POST", {}); assert.equal(started.status, 202);
  const run = await waitRun((await started.json()).run.id); assert.equal(run.status, "succeeded", run.errorSummary ?? "");
  assert.match(received, /Connected prompt fixture/); assert.match(received, /name="width"\r\n\r\n256/);
  const rows = await db.select().from(runNodes).where(eq(runNodes.runId, run.id)); assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.nodeId === "text")!.outputJson?.dataTypeId, "text");
  assert.equal(rows.find((row) => row.nodeId === "model")!.nodeSnapshotJson.kind, "model");
  assert.equal((await request(`/api/runs/${run.id}`, "GET", undefined, other)).status, 404);
});
test("inline prompts and missing connections are rejected and non-downloaded models cannot run", async () => {
  const id = await createFlow();
  assert.equal((await request(`/api/workflows/${id}`, "PUT", { name: "Flow", description: "", definition: { nodes: [{ ...model, prompt: "inline" }], edges: [] } })).status, 400);
  assert.equal((await request(`/api/workflows/${id}`, "PUT", { name: "Flow", description: "", definition: { nodes: [model], edges: [] } })).status, 400);
  const missing = { ...model, modelId: "sd15-base", parameters: {} };
  assert.equal((await request(`/api/workflows/${id}`, "PUT", { name: "Flow", description: "", definition: { nodes: [text, missing], edges: [promptEdge] } })).status, 200);
  assert.equal((await request(`/api/workflows/${id}/runs`, "POST", {})).status, 409);
});

test("uploaded and generated image outputs can both feed editing model ports", async () => {
  const id = await createFlow();
  const file = (await (await upload()).json()).artifact;
  const uploaded = { id: "upload", kind: "input", label: "Source", dataTypeId: "image", inputText: "", artifactId: file.id, parameters: {}, position: { x: 0, y: 100 } };
  const edit = { ...model, id: "edit", modelId: "qwen-image-edit-2511", parameters: { resolution: "256x256", steps: 4 }, position: { x: 600, y: 0 } };
  const definition = { nodes: [text, uploaded, model, edit], edges: [promptEdge,
    { id: "edit-prompt", source: "text", sourceHandle: "output", target: "edit", targetHandle: "prompt" },
    { id: "uploaded", source: "upload", sourceHandle: "output", target: "edit", targetHandle: "image" },
    { id: "generated", source: "model", sourceHandle: "image", target: "edit", targetHandle: "image" },
  ] };
  assert.equal((await request(`/api/workflows/${id}`, "PUT", { name: "Edit", description: "", definition })).status, 200);
  const started = await request(`/api/workflows/${id}/runs`, "POST", {}); assert.equal(started.status, 202);
  const run = await waitRun((await started.json()).run.id); assert.equal(run.status, "succeeded", run.errorSummary ?? "");
  assert.match(received, /qwen-image-edit-2511/); assert.match(received, /name="images"/);
  const files = await db.select().from(artifacts).where(eq(artifacts.runId, run.id)); assert.equal(files.length, 2);
  assert.equal((await request("/api/runs/" + run.id, "DELETE", undefined, other)).status, 404);
  assert.equal((await request("/api/runs/" + run.id, "DELETE")).status, 202);
  assert.equal((await request("/api/runs/" + run.id)).status, 404);
  for (let attempt = 0; attempt < 100; attempt++) {
    const [remaining] = await db.select({ id: runs.id }).from(runs).where(eq(runs.id, run.id));
    if (!remaining) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal((await db.select({ id: runs.id }).from(runs).where(eq(runs.id, run.id))).length, 0);
  assert.equal((await db.select().from(artifacts).where(eq(artifacts.runId, run.id))).length, 0);
  for (const generated of files) await assert.rejects(readArtifact(generated.storageKey), { code: "ENOENT" });
  assert.equal((await request("/api/artifacts/" + file.id + "/preview")).status, 200, "uploaded inputs are preserved");
});

test("deleting a run removes an uploaded input after its workflow releases it", async () => {
  const uploaded = (await (await upload()).json()).artifact;
  const id = await createFlow();
  const image = { id: "image", kind: "input", label: "Image", dataTypeId: "image", inputText: "", artifactId: uploaded.id, parameters: {}, position: { x: 0, y: 0 } };
  assert.equal((await request("/api/workflows/" + id, "PUT", { name: "Image input", description: "", definition: { nodes: [image], edges: [] } })).status, 200);
  const started = await request("/api/workflows/" + id + "/runs", "POST", {});
  const run = await waitRun((await started.json()).run.id);
  assert.equal(run.status, "succeeded");
  assert.equal((await request("/api/workflows/" + id, "DELETE")).status, 204);
  assert.equal((await request("/api/runs/" + run.id, "DELETE")).status, 202);
  for (let attempt = 0; attempt < 100; attempt++) {
    const [remaining] = await db.select({ id: runs.id }).from(runs).where(eq(runs.id, run.id));
    if (!remaining) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal((await db.select().from(artifacts).where(eq(artifacts.id, uploaded.id))).length, 0);
  await assert.rejects(readArtifact(uploaded.storageKey), { code: "ENOENT" });
});

test("audio input uses the shared datatype and runs without a model", async () => {
  const wav = Buffer.alloc(44); wav.write("RIFF", 0); wav.write("WAVE", 8); wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
  const response = await upload(owner, wav, "audio"); assert.equal(response.status, 201);
  const file = (await response.json()).artifact; assert.equal(file.dataTypeId, "audio");
  assert.equal((await request(`/api/artifacts/${file.id}/preview`)).headers.get("content-type"), "audio/wav");
  const id = await createFlow(); const node = { id: "audio", kind: "input", label: "Audio", dataTypeId: "audio", inputText: "", artifactId: file.id, parameters: {}, position: { x: 0, y: 0 } };
  assert.equal((await request(`/api/workflows/${id}`, "PUT", { name: "Audio", description: "", definition: { nodes: [node], edges: [] } })).status, 200);
  const started = await request(`/api/workflows/${id}/runs`, "POST", {}); const run = await waitRun((await started.json()).run.id);
  assert.equal(run.status, "succeeded");
});

test("video model receives its connected prompt and optional negative prompt with the runner frame contract", async () => {
  const id = await createFlow();
  const negative = { ...text, id: "negative", inputText: "Negative prompt fixture", position: { x: 0, y: 100 } };
  const video = { ...model, modelId: "wan2.1-t2v-1.3b", parameters: { frames: 41, steps: 1 } };
  const definition = { nodes: [text, negative, video], edges: [promptEdge, { id: "negative", source: "negative", sourceHandle: "output", target: "model", targetHandle: "negative_prompt" }] };
  assert.equal((await request(`/api/workflows/${id}`, "PUT", { name: "Video", description: "", definition })).status, 200);
  const started = await request(`/api/workflows/${id}/runs`, "POST", {}); assert.equal(started.status, 202);
  const run = await waitRun((await started.json()).run.id); assert.equal(run.status, "succeeded", run.errorSummary ?? "");
  assert.match(received, /name="frames"\r\n\r\n41/); assert.match(received, /Negative prompt fixture/);
  const outputs = await db.select().from(artifacts).where(eq(artifacts.runId, run.id)); assert.equal(outputs[0]!.dataTypeId, "video");
});

test("cross-origin upload and cancellation mutations are rejected", async () => {
  const headers = { origin: "http://untrusted.example", "test-user": owner, "content-type": "application/octet-stream" };
  assert.equal((await fetch(`${base}/api/artifacts/upload?dataTypeId=image`, { method: "POST", headers, body: png })).status, 403);
  assert.equal((await fetch(`${base}/api/runs/00000000-0000-4000-8000-000000000001/cancel`, { method: "POST", headers })).status, 403);
  assert.equal((await fetch(`${base}/api/runs/00000000-0000-4000-8000-000000000001`, { method: "DELETE", headers })).status, 403);
});

test("cancelling a connected-model run interrupts its HTTP request and cancels the running node", async () => {
  const id = await createFlow();
  assert.equal((await request(`/api/workflows/${id}`, "PUT", { name: "Cancel", description: "", definition: { nodes: [text, model], edges: [promptEdge] } })).status, 200);
  stallNext = true;
  const started = await request(`/api/workflows/${id}/runs`, "POST", {}); const runId = (await started.json()).run.id;
  for (let attempt = 0; attempt < 100 && !stalled; attempt++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(stalled, true);
  assert.equal((await request("/api/runs/" + runId, "DELETE")).status, 409);
  assert.equal((await request(`/api/runs/${runId}/cancel`, "POST", {})).status, 200);
  assert.equal((await waitRun(runId)).status, "cancelled");
  assert.equal(disconnected, true);
  const steps = await db.select().from(runNodes).where(eq(runNodes.runId, runId));
  assert.equal(steps.find((node) => node.nodeId === "model")!.status, "cancelled");
});

test("deleting a queued run cancels it and queues artifact cleanup", async () => {
  const id = await createFlow();
  assert.equal((await request(`/api/workflows/${id}`, "PUT", { name: "Queued delete", description: "", definition: { nodes: [text, model], edges: [promptEdge] } })).status, 200);
  stallNext = true;
  const activeResponse = await request(`/api/workflows/${id}/runs`, "POST", {});
  const activeRunId = (await activeResponse.json()).run.id as string;
  for (let attempt = 0; attempt < 100 && !stalled; attempt++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(stalled, true);

  const queuedResponse = await request(`/api/workflows/${id}/runs`, "POST", {});
  const queuedRunId = (await queuedResponse.json()).run.id as string;
  const removed = await request(`/api/runs/${queuedRunId}`, "DELETE");
  assert.equal(removed.status, 202);
  const [queuedRun] = await db.select().from(runs).where(eq(runs.id, queuedRunId));
  assert.equal(queuedRun!.status, "cancelled");
  assert.equal((await db.select().from(runDeletions).where(eq(runDeletions.runId, queuedRunId))).length, 1);

  assert.equal((await request(`/api/runs/${activeRunId}/cancel`, "POST", {})).status, 200);
  assert.equal((await waitRun(activeRunId)).status, "cancelled");
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!(await db.select({ id: runs.id }).from(runs).where(eq(runs.id, queuedRunId))).length) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal((await db.select({ id: runs.id }).from(runs).where(eq(runs.id, queuedRunId))).length, 0);
});
