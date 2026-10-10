import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { db, pool } from "../src/db.js";
import { agentsRouter } from "../src/agents.js";
import { workflowsRouter } from "../src/workflows.js";
import { agents, users, workflowEdges, workflowNodes, workflows } from "../src/schema.js";
import { eq } from "drizzle-orm";

let server: Server;
let baseUrl: string;
let ownerId: string;
let agentId: string;
let workflowId: string;

before(async () => {
  const unique = crypto.randomUUID();
  const [owner] = await db.insert(users).values({
    googleSubject: `workflow-test-${unique}`,
    email: `workflow-test-${unique}@example.invalid`,
    emailVerified: true,
  }).returning({ id: users.id });
  ownerId = owner.id;

  const [agent] = await db.insert(agents).values({
    userId: ownerId,
    modality: "text",
    name: "Integration test agent",
    description: "Temporary agent for workflow API tests.",
  }).returning({ id: agents.id });
  agentId = agent.id;

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.userId = ownerId; next(); });
  app.use("/api/workflows", workflowsRouter);
  app.use("/api/agents", agentsRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not determine integration test server address.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (workflowId) await db.delete(workflows).where(eq(workflows.id, workflowId));
  if (agentId) await db.delete(agents).where(eq(agents.id, agentId));
  if (ownerId) await db.delete(users).where(eq(users.id, ownerId));
  await pool.end();
});

function sqlState(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error) return error.code;
  if ("cause" in error && typeof error.cause === "object" && error.cause !== null && "code" in error.cause) return error.cause.code;
  return undefined;
}

test("workflow saves replace the current graph, preserve connections, and protect referenced agents", async () => {
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
  const createResponse = await fetch(`${baseUrl}/api/workflows`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ name: "Workflow persistence test", description: "Temporary integration workflow." }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json() as { workflow: { id: string } };
  workflowId = created.workflow.id;

  const firstDefinition = {
    nodes: [
      { id: "node-a", agentId, instructions: "First step", position: { x: 50, y: 75 } },
      { id: "node-b", agentId, instructions: "Second step", position: { x: 320, y: 75 } },
    ],
    edges: [{ id: "edge-a-b", source: "node-a", target: "node-b" }],
  };
  const saveResponse = await fetch(`${baseUrl}/api/workflows/${workflowId}`, {
    method: "PUT",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ name: "Workflow persistence test", description: "Saved graph.", definition: firstDefinition }),
  });
  assert.equal(saveResponse.status, 200);

  const loadResponse = await fetch(`${baseUrl}/api/workflows/${workflowId}`);
  assert.equal(loadResponse.status, 200);
  const loaded = await loadResponse.json() as { definition: typeof firstDefinition };
  assert.deepEqual(loaded.definition, firstDefinition);

  const persistedEdges = await db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, workflowId));
  assert.equal(persistedEdges.length, 1);
  assert.equal(persistedEdges[0]?.sourceNodeId, "node-a");
  assert.equal(persistedEdges[0]?.targetNodeId, "node-b");

  const deleteWhileUsed = await fetch(`${baseUrl}/api/agents/${agentId}`, { method: "DELETE", headers: { origin } });
  assert.equal(deleteWhileUsed.status, 409);
  await assert.rejects(
    db.delete(agents).where(eq(agents.id, agentId)),
    (error: unknown) => sqlState(error) === "23503",
  );

  const invalidCycle = {
    nodes: firstDefinition.nodes,
    edges: [
      { id: "edge-a-b", source: "node-a", target: "node-b" },
      { id: "edge-b-a", source: "node-b", target: "node-a" },
    ],
  };
  const invalidResponse = await fetch(`${baseUrl}/api/workflows/${workflowId}`, {
    method: "PUT",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ name: "Workflow persistence test", description: "Invalid graph.", definition: invalidCycle }),
  });
  assert.equal(invalidResponse.status, 400);

  const replacementDefinition = {
    nodes: [{ id: "node-b", agentId, instructions: "Only current node", position: { x: 400, y: 120 } }],
    edges: [],
  };
  const replacementResponse = await fetch(`${baseUrl}/api/workflows/${workflowId}`, {
    method: "PUT",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ name: "Workflow persistence test", description: "Replacement graph.", definition: replacementDefinition }),
  });
  assert.equal(replacementResponse.status, 200);

  const replaced = await (await fetch(`${baseUrl}/api/workflows/${workflowId}`)).json() as { definition: typeof replacementDefinition };
  assert.deepEqual(replaced.definition, replacementDefinition);
  const currentNodes = await db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, workflowId));
  const currentEdges = await db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, workflowId));
  assert.deepEqual(currentNodes.map((node) => node.nodeId), ["node-b"]);
  assert.equal(currentEdges.length, 0);

  const clearResponse = await fetch(`${baseUrl}/api/workflows/${workflowId}`, {
    method: "PUT",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ name: "Workflow persistence test", description: "Cleared graph.", definition: { nodes: [], edges: [] } }),
  });
  assert.equal(clearResponse.status, 200);
  const deleteAfterUnlink = await fetch(`${baseUrl}/api/agents/${agentId}`, { method: "DELETE", headers: { origin } });
  assert.equal(deleteAfterUnlink.status, 204);
});
