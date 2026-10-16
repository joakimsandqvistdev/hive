import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db.js";
import { requireAuthenticatedUser } from "./auth.js";
import { artifacts, webhookDeliveries, workflowEdges, workflowNodes, workflowTriggers, workflows } from "./schema.js";
import { createWorkflowRunInTransaction, definitionFor, workflowRunErrorMessage, type WorkflowInputOverride } from "./workflowRunService.js";
import { loadDataTypes, loadModelIoContracts } from "./modelContracts.js";
import { decryptWebhookSecret, encryptWebhookSecret, webhookSecretEncryptionConfigured } from "./webhookSecrets.js";
import type { WorkflowDefinition } from "./workflowDefinition.js";
import { collectWebhookTextInputs, webhookTextInputConflict, webhookPathIsValid } from "./webhookInputMappings.js";
import { loadCustomNodeCatalog } from "./customNodeCatalog.js";

const router = Router();
const mappingSchema = z.array(z.discriminatedUnion("source", [
  z.object({ nodeId: z.string().min(1).max(5000), source: z.literal("payload"), path: z.string().min(1).max(200) }).strict(),
  z.object({ nodeId: z.string().min(1).max(5000), source: z.literal("library"), artifactId: z.string().uuid() }).strict(),
])).max(100);
const createSchema = z.object({ name: z.string().trim().min(1).max(100), inputMappings: mappingSchema }).strict();
const updateSchema = z.object({ name: z.string().trim().min(1).max(100).optional(), enabled: z.boolean().optional(), inputMappings: mappingSchema.optional() }).strict();
const MAX_BODY_BYTES = 256 * 1024;
const MAX_JSON_DEPTH = 10;
const MAX_REQUESTS_PER_MINUTE = 10;
const SIGNATURE_FRESHNESS_SECONDS = 5 * 60;
const DELIVERY_RETENTION_DAYS = 30;

type InputMapping = z.infer<typeof mappingSchema>[number];
type DatabaseContext = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type TriggerRow = typeof workflowTriggers.$inferSelect;

function ownerId(res: express.Response) { return res.locals.userId as string; }
function originIsValid(req: express.Request) { return req.get("origin") === (process.env.WEB_ORIGIN ?? "http://localhost:5173"); }
function apiPublicUrl() {
  const value = process.env.WEBHOOK_PUBLIC_API_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}
function endpointFor(publicId: string) {
  const base = apiPublicUrl();
  return base ? `${base}/api/webhooks/${encodeURIComponent(publicId)}` : null;
}
function safeTrigger(trigger: TriggerRow) {
  return {
    id: trigger.id, name: trigger.name, workflowName: trigger.workflowName,
    enabled: trigger.enabled && !trigger.deletedAt, hasSecret: Boolean(trigger.encryptedSecret),
    endpointUrl: endpointFor(trigger.publicId), inputMappings: trigger.inputMappings,
    createdAt: trigger.createdAt, updatedAt: trigger.updatedAt, deletedAt: trigger.deletedAt,
  };
}
function generatedSecret() { return randomBytes(32).toString("base64url"); }
const validInputPath = webhookPathIsValid;
function jsonDepth(value: unknown, depth = 0): number {
  if (depth > MAX_JSON_DEPTH) return depth;
  if (Array.isArray(value)) return value.reduce((max, item) => Math.max(max, jsonDepth(item, depth + 1)), depth);
  if (value && typeof value === "object") return Object.values(value).reduce((max, item) => Math.max(max, jsonDepth(item, depth + 1)), depth);
  return depth;
}
function valueAtPath(payload: Record<string, unknown>, path: string): unknown {
  let value: unknown = payload;
  for (const key of path.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
function scalarText(value: unknown): string | null {
  if (typeof value === "string") return value.length <= 8000 ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return null;
}
async function validateMappings(
  owner: string,
  workflowId: string,
  definition: WorkflowDefinition,
  catalog: Awaited<ReturnType<typeof loadCustomNodeCatalog>>,
  inputMappings: InputMapping[],
  tx: DatabaseContext,
): Promise<string | null> {
  const inputs = new Map(definition.nodes.filter((node) => node.kind === "input").map((node) => [node.id, node]));
  const webhookInputs = collectWebhookTextInputs(definition, catalog);
  if (webhookTextInputConflict(webhookInputs)) return "webhook_identifier_conflict";
  const webhookInputsById = new Map(webhookInputs.map((node) => [node.nodeId, node]));
  const seen = new Set<string>();
  const assetIds: string[] = [];
  for (const mapping of inputMappings) {
    if (seen.has(mapping.nodeId)) return "duplicate_input_mapping";
    seen.add(mapping.nodeId);
    if (mapping.source === "payload") {
      const node = webhookInputsById.get(mapping.nodeId);
      if (!node || node.jsonPath !== mapping.path || !validInputPath(mapping.path)) return "invalid_input_mapping";
    } else {
      const node = inputs.get(mapping.nodeId);
      if (!node) return "invalid_input_mapping";
      if (!node.dataTypeId || node.dataTypeId === "text") return "invalid_input_mapping";
      assetIds.push(mapping.artifactId);
    }
  }
  for (const node of inputs.values()) {
    const hasConfiguredValue = node.dataTypeId === "text" ? Boolean(node.inputText.trim()) : Boolean(node.artifactId);
    if (!seen.has(node.id) && !hasConfiguredValue) return "required_input_unmapped";
  }
  if (!assetIds.length) return null;
  const files = await tx.select({ id: artifacts.id, dataTypeId: artifacts.dataTypeId, savedToLibrary: artifacts.savedToLibrary })
    .from(artifacts).where(and(eq(artifacts.userId, owner), inArray(artifacts.id, assetIds)));
  const filesById = new Map(files.map((file) => [file.id, file]));
  for (const mapping of inputMappings) {
    if (mapping.source !== "library") continue;
    const node = inputs.get(mapping.nodeId)!;
    const file = filesById.get(mapping.artifactId);
    if (!file || !file.savedToLibrary || file.dataTypeId !== node.dataTypeId) return "invalid_media_mapping";
  }
  return null;
}

async function resolveOverrides(
  owner: string,
  definition: WorkflowDefinition,
  catalog: Awaited<ReturnType<typeof loadCustomNodeCatalog>>,
  inputMappings: InputMapping[],
  payload: Record<string, unknown>,
  tx: DatabaseContext,
): Promise<{ overrides?: Record<string, WorkflowInputOverride>; error?: string; preview?: Array<{ nodeId: string; label: string; value: string }> }> {
  const inputs = new Map(definition.nodes.filter((node) => node.kind === "input").map((node) => [node.id, node]));
  const webhookInputs = new Map(collectWebhookTextInputs(definition, catalog).map((node) => [node.nodeId, node]));
  const overrides: Record<string, WorkflowInputOverride> = {};
  const preview: Array<{ nodeId: string; label: string; value: string }> = [];
  for (const mapping of inputMappings) {
    if (mapping.source === "payload") {
      if (!validInputPath(mapping.path)) return { error: "invalid_input_mapping" };
      const node = webhookInputs.get(mapping.nodeId);
      if (!node || node.jsonPath !== mapping.path) return { error: "invalid_input_mapping" };
      const requestText = scalarText(valueAtPath(payload, mapping.path));
      const text = requestText?.trim() ? requestText : node.defaultText;
      if (!text.trim()) return { error: "required_input_missing" };
      overrides[node.nodeId] = { inputText: text };
      preview.push({ nodeId: node.nodeId, label: node.label, value: requestText?.trim() ? text : `${text} (configured default)` });
    } else {
      const node = inputs.get(mapping.nodeId);
      if (!node) return { error: "invalid_input_mapping" };
      const [asset] = await tx.select({ id: artifacts.id, dataTypeId: artifacts.dataTypeId, displayName: artifacts.displayName, savedToLibrary: artifacts.savedToLibrary })
        .from(artifacts).where(and(eq(artifacts.id, mapping.artifactId), eq(artifacts.userId, owner))).limit(1);
      if (!asset || !asset.savedToLibrary || asset.dataTypeId !== node.dataTypeId) return { error: "invalid_media_mapping" };
      overrides[node.id] = { artifactId: asset.id };
      preview.push({ nodeId: node.id, label: node.label, value: `Saved media: ${asset.displayName}` });
    }
  }
  return { overrides, preview };
}

async function loadWorkflowDefinition(tx: DatabaseContext, workflowId: string, owner: string) {
  const [workflow] = await tx.select().from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.userId, owner), eq(workflows.isCustomNode, false), isNull(workflows.archivedAt))).limit(1);
  if (!workflow) return null;
  const nodes = await tx.select().from(workflowNodes).where(and(eq(workflowNodes.workflowId, workflowId), eq(workflowNodes.userId, owner)));
  const edges = await tx.select().from(workflowEdges).where(eq(workflowEdges.workflowId, workflowId));
  return { workflow, definition: definitionFor(nodes, edges) as WorkflowDefinition };
}

function storedMappings(trigger: TriggerRow): InputMapping[] {
  return mappingSchema.parse(trigger.inputMappings);
}

function textInputMappings(definition: WorkflowDefinition, catalog: Awaited<ReturnType<typeof loadCustomNodeCatalog>>): InputMapping[] {
  return collectWebhookTextInputs(definition, catalog).map((input) => ({ nodeId: input.nodeId, source: "payload", path: input.jsonPath }));
}

function triggerMappings(
  definition: WorkflowDefinition,
  catalog: Awaited<ReturnType<typeof loadCustomNodeCatalog>>,
  mediaMappings: InputMapping[],
): InputMapping[] {
  return [...textInputMappings(definition, catalog), ...mediaMappings.filter((mapping) => mapping.source === "library")];
}

async function consumeRateLimit(publicId: string): Promise<{ trigger: TriggerRow; secret: string } | "missing" | "limited"> {
  return db.transaction(async (tx) => {
    const [trigger] = await tx.select().from(workflowTriggers).where(eq(workflowTriggers.publicId, publicId)).limit(1).for("update");
    if (!trigger || !trigger.enabled || trigger.deletedAt || !trigger.workflowId || !trigger.encryptedSecret) return "missing";
    const now = new Date();
    const expired = !trigger.requestWindowStartedAt || now.getTime() - trigger.requestWindowStartedAt.getTime() >= 60_000;
    if (!expired && trigger.requestCount >= MAX_REQUESTS_PER_MINUTE) return "limited";
    await tx.update(workflowTriggers).set({
      requestWindowStartedAt: expired ? now : trigger.requestWindowStartedAt,
      requestCount: expired ? 1 : trigger.requestCount + 1,
    }).where(eq(workflowTriggers.id, trigger.id));
    return { trigger, secret: decryptWebhookSecret(trigger.encryptedSecret) };
  });
}

function verifySignature(secret: string, timestampText: string, eventId: string, rawBody: Buffer, signatureHeader: string | undefined) {
  if (!/^[0-9]{1,12}$/.test(timestampText) || !/^[A-Za-z0-9._-]{1,200}$/.test(eventId)) return false;
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_FRESHNESS_SECONDS) return false;
  const match = signatureHeader?.match(/^v1=([0-9a-f]{64})$/i);
  if (!match) return false;
  const digest = createHash("sha256").update(rawBody).digest("hex");
  const expected = createHmac("sha256", secret).update(`v1\n${timestampText}\n${eventId}\n${digest}`, "utf8").digest();
  const received = Buffer.from(match[1]!, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function recordRejected(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], trigger: TriggerRow, eventId: string, digest: string, errorCode: string, statusCode: number) {
  await tx.insert(webhookDeliveries).values({ triggerId: trigger.id, userId: trigger.userId, eventId, bodyDigest: digest, outcome: "rejected", statusCode, errorCode }).onConflictDoNothing();
}

router.post("/:publicId", express.raw({ type: "application/json", limit: MAX_BODY_BYTES }), async (req, res, next) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const contentType = req.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (rawBody.length > 0 && contentType !== "application/json") { res.status(400).json({ error: "json_required" }); return; }
  const timestamp = req.get("x-hive-timestamp") ?? "";
  const eventId = req.get("x-hive-event-id") ?? "";
  const signature = req.get("x-hive-signature");
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(eventId)) { res.status(400).json({ error: "invalid_event_id" }); return; }
  const rate = await consumeRateLimit(req.params.publicId!);
  if (rate === "missing") { res.status(404).json({ error: "trigger_not_found" }); return; }
  if (rate === "limited") { res.status(429).json({ error: "rate_limited" }); return; }
  if (!verifySignature(rate.secret, timestamp, eventId, rawBody, signature)) { res.status(401).json({ error: "invalid_signature" }); return; }
  const digest = createHash("sha256").update(rawBody).digest("hex");
  let payload: unknown;
  try { payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {}; }
  catch { payload = null; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || jsonDepth(payload) > MAX_JSON_DEPTH) {
    try {
      await db.transaction(async (tx) => {
        const [trigger] = await tx.select().from(workflowTriggers).where(eq(workflowTriggers.id, rate.trigger.id)).limit(1).for("update");
        if (trigger?.enabled && trigger.secretVersion === rate.trigger.secretVersion) await recordRejected(tx, trigger, eventId, digest, "invalid_payload", 400);
      });
    } catch (error) { next(error); return; }
    res.status(400).json({ error: "invalid_payload" }); return;
  }
  try {
    const contracts = await loadModelIoContracts();
    const types = await loadDataTypes();
    const catalog = await loadCustomNodeCatalog(rate.trigger.userId);
    const result = await db.transaction(async (tx) => {
      const [trigger] = await tx.select().from(workflowTriggers).where(and(eq(workflowTriggers.id, rate.trigger.id), eq(workflowTriggers.enabled, true), isNull(workflowTriggers.deletedAt))).limit(1).for("update");
      if (!trigger || trigger.secretVersion !== rate.trigger.secretVersion || !trigger.workflowId || !trigger.encryptedSecret) return { kind: "missing" as const };
      const [previous] = await tx.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.triggerId, trigger.id), eq(webhookDeliveries.eventId, eventId))).limit(1);
      if (previous) return previous.bodyDigest === digest
        ? { kind: "duplicate" as const, runId: previous.runId, outcome: previous.outcome, statusCode: previous.statusCode, errorCode: previous.errorCode }
        : { kind: "event_conflict" as const };
      const loaded = await loadWorkflowDefinition(tx, trigger.workflowId, trigger.userId);
      if (!loaded || loaded.workflow.needsAttention) {
        await recordRejected(tx, trigger, eventId, digest, loaded ? "workflow_needs_attention" : "workflow_unavailable", 409);
        return { kind: "rejected" as const, status: 409, error: loaded ? "workflow_needs_attention" : "workflow_unavailable" };
      }
      const inputMappings = storedMappings(trigger);
      const mappingError = await validateMappings(trigger.userId, loaded.workflow.id, loaded.definition, catalog, inputMappings, tx);
      if (mappingError) {
        await recordRejected(tx, trigger, eventId, digest, mappingError, 400);
        return { kind: "rejected" as const, status: 400, error: mappingError };
      }
      const resolved = await resolveOverrides(trigger.userId, loaded.definition, catalog, inputMappings, payload as Record<string, unknown>, tx);
      if (resolved.error) {
        await recordRejected(tx, trigger, eventId, digest, resolved.error, 400);
        return { kind: "rejected" as const, status: 400, error: resolved.error };
      }
      const created = await createWorkflowRunInTransaction(tx, loaded.workflow.id, trigger.userId, contracts, types, undefined, { inputOverrides: resolved.overrides, triggerId: trigger.id });
      if (!created.ok) {
        const status = created.error === "workflow_not_found" ? 404 : created.error === "model_not_downloaded" || created.error === "workflow_needs_attention" ? 409 : 400;
        await recordRejected(tx, trigger, eventId, digest, created.error, status);
        return { kind: "rejected" as const, status, error: created.error };
      }
      await tx.insert(webhookDeliveries).values({ triggerId: trigger.id, userId: trigger.userId, eventId, bodyDigest: digest, outcome: "accepted", statusCode: 202, runId: created.run.id });
      return { kind: "accepted" as const, runId: created.run.id };
    });
    if (result.kind === "missing") { res.status(404).json({ error: "trigger_not_found" }); return; }
    if (result.kind === "event_conflict") { res.status(409).json({ error: "event_id_conflict" }); return; }
    if (result.kind === "duplicate") {
      if (result.outcome === "accepted") { res.status(202).json({ runId: result.runId, deduplicated: true }); return; }
      res.status(result.statusCode).json({ error: result.errorCode ?? "delivery_rejected", deduplicated: true }); return;
    }
    if (result.kind === "rejected") { res.status(result.status).json({ error: result.error }); return; }
    res.status(202).json({ runId: result.runId, status: "queued" });
  } catch (error) { next(error); }
});

router.use(requireAuthenticatedUser);
router.use(express.json({ limit: "256kb" }));

router.get("/workflows/:workflowId", async (req, res, next) => {
  try {
    const loaded = await loadWorkflowDefinition(db, req.params.workflowId!, ownerId(res));
    if (!loaded) { res.status(404).json({ error: "workflow_not_found" }); return; }
    const catalog = await loadCustomNodeCatalog(ownerId(res));
    const triggers = await db.select().from(workflowTriggers).where(and(eq(workflowTriggers.workflowId, loaded.workflow.id), eq(workflowTriggers.userId, ownerId(res)), isNull(workflowTriggers.deletedAt))).orderBy(desc(workflowTriggers.createdAt));
    const inputNodes = loaded.definition.nodes.filter((node) => node.kind === "input").map(({ id, label, dataTypeId, inputText, artifactId }) => ({ id, label, dataTypeId, configured: Boolean(inputText?.trim() || artifactId) }));
    const webhookTextInputs = collectWebhookTextInputs(loaded.definition, catalog).map(({ nodeId, label, jsonPath, defaultText }) => ({ nodeId, label, jsonPath, defaultText, configured: Boolean(defaultText.trim()) }));
    res.json({ workflow: { id: loaded.workflow.id, name: loaded.workflow.name }, inputNodes, webhookTextInputs, triggers: triggers.map(safeTrigger), publicApiConfigured: Boolean(apiPublicUrl()) });
  } catch (error) { next(error); }
});

router.get("/library-media", async (_req, res, next) => {
  try {
    const items = await db.select({ id: artifacts.id, dataTypeId: artifacts.dataTypeId, displayName: artifacts.displayName, mediaType: artifacts.mediaType, byteSize: artifacts.byteSize })
      .from(artifacts).where(and(eq(artifacts.userId, ownerId(res)), eq(artifacts.savedToLibrary, true))).orderBy(desc(artifacts.createdAt));
    res.json({ items });
  } catch (error) { next(error); }
});

router.post("/workflows/:workflowId", async (req, res, next) => {
  if (!originIsValid(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_trigger" }); return; }
  if (!webhookSecretEncryptionConfigured()) { res.status(503).json({ error: "webhook_encryption_not_configured" }); return; }
  if (!apiPublicUrl()) { res.status(503).json({ error: "webhook_public_url_not_configured" }); return; }
  try {
    const catalog = await loadCustomNodeCatalog(ownerId(res));
    const secret = generatedSecret();
    const result = await db.transaction(async (tx) => {
      const loaded = await loadWorkflowDefinition(tx, req.params.workflowId!, ownerId(res));
      if (!loaded) return { kind: "not_found" as const };
      if (loaded.workflow.needsAttention) return { kind: "needs_attention" as const };
      const mappings = triggerMappings(loaded.definition, catalog, parsed.data.inputMappings);
      const mappingError = await validateMappings(ownerId(res), loaded.workflow.id, loaded.definition, catalog, mappings, tx);
      if (mappingError) return { kind: "invalid_mapping" as const, error: mappingError };
      const [created] = await tx.insert(workflowTriggers).values({
        publicId: randomBytes(24).toString("base64url"), userId: ownerId(res), workflowId: loaded.workflow.id,
        workflowName: loaded.workflow.name, name: parsed.data.name, encryptedSecret: encryptWebhookSecret(secret), inputMappings: mappings,
      }).returning();
      return { kind: "created" as const, trigger: created! };
    });
    if (result.kind === "not_found") { res.status(404).json({ error: "workflow_not_found" }); return; }
    if (result.kind === "needs_attention") { res.status(409).json({ error: "workflow_needs_attention" }); return; }
    if (result.kind === "invalid_mapping") { res.status(400).json({ error: result.error }); return; }
    res.status(201).json({ trigger: safeTrigger(result.trigger), secret, endpointUrl: endpointFor(result.trigger.publicId) });
  } catch (error) { next(error); }
});

router.patch("/triggers/:triggerId", async (req, res, next) => {
  if (!originIsValid(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) { res.status(400).json({ error: "invalid_trigger_update" }); return; }
  try {
    const catalog = await loadCustomNodeCatalog(ownerId(res));
    const result = await db.transaction(async (tx) => {
      const [trigger] = await tx.select().from(workflowTriggers).where(and(eq(workflowTriggers.id, req.params.triggerId!), eq(workflowTriggers.userId, ownerId(res)), isNull(workflowTriggers.deletedAt))).limit(1).for("update");
      if (!trigger) return null;
      let inputMappings: InputMapping[] | undefined;
      if (parsed.data.inputMappings && trigger.workflowId) {
        const loaded = await loadWorkflowDefinition(tx, trigger.workflowId, ownerId(res));
        if (!loaded) return null;
        inputMappings = [
          ...storedMappings(trigger).filter((mapping) => mapping.source === "payload"),
          ...parsed.data.inputMappings.filter((mapping) => mapping.source === "library"),
        ];
        const mappingError = await validateMappings(ownerId(res), loaded.workflow.id, loaded.definition, catalog, inputMappings, tx);
        if (mappingError) return { error: mappingError } as const;
      }
      if (parsed.data.enabled) {
        if (!trigger.workflowId || !trigger.encryptedSecret) return { error: "trigger_unavailable" } as const;
        const loaded = await loadWorkflowDefinition(tx, trigger.workflowId, ownerId(res));
        if (!loaded) return { error: "trigger_unavailable" } as const;
        if (loaded.workflow.needsAttention) return { error: "workflow_needs_attention" } as const;
        const mappings = inputMappings ?? storedMappings(trigger);
        const mappingError = await validateMappings(ownerId(res), loaded.workflow.id, loaded.definition, catalog, mappings, tx);
        if (mappingError) return { error: mappingError } as const;
      }
      const [updated] = await tx.update(workflowTriggers).set({ ...parsed.data, ...(inputMappings ? { inputMappings } : {}), updatedAt: new Date() }).where(eq(workflowTriggers.id, trigger.id)).returning();
      return { trigger: updated! } as const;
    });
    if (!result) { res.status(404).json({ error: "trigger_not_found" }); return; }
    if ("error" in result) { res.status(400).json({ error: result.error }); return; }
    res.json({ trigger: safeTrigger(result.trigger) });
  } catch (error) { next(error); }
});

router.post("/triggers/:triggerId/rotate-secret", async (req, res, next) => {
  if (!originIsValid(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  if (!webhookSecretEncryptionConfigured()) { res.status(503).json({ error: "webhook_encryption_not_configured" }); return; }
  try {
    const secret = generatedSecret();
    const [trigger] = await db.update(workflowTriggers).set({ encryptedSecret: encryptWebhookSecret(secret), secretVersion: sql`${workflowTriggers.secretVersion} + 1`, updatedAt: new Date() })
      .where(and(eq(workflowTriggers.id, req.params.triggerId!), eq(workflowTriggers.userId, ownerId(res)), isNull(workflowTriggers.deletedAt))).returning();
    if (!trigger) { res.status(404).json({ error: "trigger_not_found" }); return; }
    res.json({ trigger: safeTrigger(trigger), secret, endpointUrl: endpointFor(trigger.publicId) });
  } catch (error) { next(error); }
});

router.delete("/triggers/:triggerId", async (req, res, next) => {
  if (!originIsValid(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    const [trigger] = await db.update(workflowTriggers).set({ enabled: false, encryptedSecret: null, deletedAt: new Date(), updatedAt: new Date(), secretVersion: sql`${workflowTriggers.secretVersion} + 1` })
      .where(and(eq(workflowTriggers.id, req.params.triggerId!), eq(workflowTriggers.userId, ownerId(res)), isNull(workflowTriggers.deletedAt))).returning({ id: workflowTriggers.id });
    if (!trigger) { res.status(404).json({ error: "trigger_not_found" }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/triggers/:triggerId/deliveries", async (req, res, next) => {
  try {
    const [trigger] = await db.select({ id: workflowTriggers.id }).from(workflowTriggers)
      .where(and(eq(workflowTriggers.id, req.params.triggerId!), eq(workflowTriggers.userId, ownerId(res)), isNull(workflowTriggers.deletedAt))).limit(1);
    if (!trigger) { res.status(404).json({ error: "trigger_not_found" }); return; }
    const items = await db.select({ id: webhookDeliveries.id, eventId: webhookDeliveries.eventId, outcome: webhookDeliveries.outcome, statusCode: webhookDeliveries.statusCode, errorCode: webhookDeliveries.errorCode, runId: webhookDeliveries.runId, receivedAt: webhookDeliveries.receivedAt })
      .from(webhookDeliveries).where(and(eq(webhookDeliveries.triggerId, trigger.id), gte(webhookDeliveries.receivedAt, new Date(Date.now() - DELIVERY_RETENTION_DAYS * 86400_000))))
      .orderBy(desc(webhookDeliveries.receivedAt)).limit(50);
    res.json({ items });
  } catch (error) { next(error); }
});

router.post("/triggers/:triggerId/preview", async (req, res, next) => {
  const payload = req.body?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || jsonDepth(payload) > MAX_JSON_DEPTH) { res.status(400).json({ error: "invalid_payload" }); return; }
  try {
    const catalog = await loadCustomNodeCatalog(ownerId(res));
    const [trigger] = await db.select().from(workflowTriggers).where(and(eq(workflowTriggers.id, req.params.triggerId!), eq(workflowTriggers.userId, ownerId(res)), eq(workflowTriggers.enabled, true), isNull(workflowTriggers.deletedAt))).limit(1);
    if (!trigger?.workflowId) { res.status(404).json({ error: "trigger_not_found" }); return; }
    const loaded = await loadWorkflowDefinition(db, trigger.workflowId, ownerId(res));
    if (!loaded || loaded.workflow.needsAttention) { res.status(409).json({ error: "workflow_needs_attention" }); return; }
    const inputMappings = storedMappings(trigger);
    const mappingError = await validateMappings(ownerId(res), loaded.workflow.id, loaded.definition, catalog, inputMappings, db);
    if (mappingError) { res.status(400).json({ error: mappingError }); return; }
    const result = await resolveOverrides(ownerId(res), loaded.definition, catalog, inputMappings, payload, db);
    if (result.error) { res.status(400).json({ error: result.error }); return; }
    res.json({ inputs: result.preview });
  } catch (error) { next(error); }
});

router.post("/triggers/:triggerId/test-run", async (req, res, next) => {
  if (!originIsValid(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  const payload = req.body?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || jsonDepth(payload) > MAX_JSON_DEPTH) { res.status(400).json({ error: "invalid_payload" }); return; }
  try {
    const contracts = await loadModelIoContracts();
    const types = await loadDataTypes();
    const catalog = await loadCustomNodeCatalog(ownerId(res));
    const result = await db.transaction(async (tx) => {
      const [trigger] = await tx.select().from(workflowTriggers).where(and(eq(workflowTriggers.id, req.params.triggerId!), eq(workflowTriggers.userId, ownerId(res)), eq(workflowTriggers.enabled, true), isNull(workflowTriggers.deletedAt))).limit(1).for("share");
      if (!trigger?.workflowId) return { kind: "not_found" as const };
      const loaded = await loadWorkflowDefinition(tx, trigger.workflowId, ownerId(res));
      if (!loaded || loaded.workflow.needsAttention) return { kind: "not_found" as const };
      const inputMappings = storedMappings(trigger);
      const mappingError = await validateMappings(ownerId(res), loaded.workflow.id, loaded.definition, catalog, inputMappings, tx);
      if (mappingError) return { kind: "invalid" as const, error: mappingError };
      const resolved = await resolveOverrides(ownerId(res), loaded.definition, catalog, inputMappings, payload, tx);
      if (resolved.error) return { kind: "invalid" as const, error: resolved.error };
      const created = await createWorkflowRunInTransaction(tx, loaded.workflow.id, ownerId(res), contracts, types, undefined, { inputOverrides: resolved.overrides, triggerId: trigger.id });
      if (!created.ok) return { kind: "invalid" as const, error: created.error };
      return { kind: "created" as const, run: created.run };
    });
    if (result.kind === "not_found") { res.status(404).json({ error: "trigger_not_found" }); return; }
    if (result.kind === "invalid") { res.status(400).json({ error: result.error, message: workflowRunErrorMessage(result.error) }); return; }
    res.status(202).json({ run: result.run });
  } catch (error) { next(error); }
});

export async function purgeExpiredWebhookDeliveries() {
  await db.delete(webhookDeliveries).where(lt(webhookDeliveries.receivedAt, new Date(Date.now() - DELIVERY_RETENTION_DAYS * 86400_000)));
  await db.delete(workflowTriggers).where(and(sql`${workflowTriggers.deletedAt} IS NOT NULL`, lt(workflowTriggers.deletedAt, new Date(Date.now() - DELIVERY_RETENTION_DAYS * 86400_000))));
}

export { router as webhookTriggersRouter };
