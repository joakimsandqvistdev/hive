import { boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid, type PgTableExtraConfigValue } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const modelModality = pgEnum("model_modality", ["image", "video", "audio"]);
export const modelDataDirection = pgEnum("model_data_direction", ["input", "output"]);
export const modelInputTransport = pgEnum("model_input_transport", ["prompt", "connection"]);
export const runStatus = pgEnum("run_status", ["queued", "running", "succeeded", "failed", "cancel_requested", "cancelled"]);
export const runNodeStatus = pgEnum("run_node_status", ["queued", "running", "succeeded", "failed", "skipped", "cancelled"]);
export const workflowJobStatus = pgEnum("workflow_job_status", ["active", "paused", "completed", "failed", "removed"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  googleSubject: text("google_subject").notNull().unique(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table): PgTableExtraConfigValue[] => [index("users_email_idx").on(table.email)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table): PgTableExtraConfigValue[] => [
  index("sessions_user_id_idx").on(table.userId),
  index("sessions_expires_at_idx").on(table.expiresAt),
]);

export const dataTypes = pgTable("data_types", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  mediaType: text("media_type").notNull(),
});

export const models = pgTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  modality: modelModality("modality").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
});

export const modelDataTypes = pgTable("model_data_types", {
  modelId: text("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  direction: modelDataDirection("direction").notNull(),
  portKey: text("port_key").notNull(),
  dataTypeId: text("data_type_id").notNull().references(() => dataTypes.id, { onDelete: "restrict" }),
  label: text("label").notNull(),
  transport: modelInputTransport("transport"),
  minCount: integer("min_count").notNull().default(1),
  maxCount: integer("max_count").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table): PgTableExtraConfigValue[] => [
  primaryKey({ columns: [table.modelId, table.direction, table.portKey], name: "model_data_types_pk" }),
  check("model_data_types_count_check", sql`min_count >= 0 and max_count >= min_count`),
  check("model_data_types_transport_check", sql`(direction = 'input' and transport is not null) or (direction = 'output' and transport is null)`),
]);

export const modelInputGroups = pgTable("model_input_groups", {
  modelId: text("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  groupKey: text("group_key").notNull(),
  label: text("label").notNull(),
  minCount: integer("min_count").notNull().default(1),
  maxCount: integer("max_count").notNull().default(1),
}, (table): PgTableExtraConfigValue[] => [
  primaryKey({ columns: [table.modelId, table.groupKey], name: "model_input_groups_pk" }),
  check("model_input_groups_count_check", sql`min_count >= 0 and max_count >= min_count`),
]);

export const modelInputGroupPorts = pgTable("model_input_group_ports", {
  modelId: text("model_id").notNull(),
  groupKey: text("group_key").notNull(),
  direction: modelDataDirection("direction").notNull().default("input"),
  portKey: text("port_key").notNull(),
}, (table): PgTableExtraConfigValue[] => [
  primaryKey({ columns: [table.modelId, table.groupKey, table.portKey], name: "model_input_group_ports_pk" }),
  foreignKey({ columns: [table.modelId, table.groupKey], foreignColumns: [modelInputGroups.modelId, modelInputGroups.groupKey], name: "model_input_group_ports_group_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.modelId, table.direction, table.portKey], foreignColumns: [modelDataTypes.modelId, modelDataTypes.direction, modelDataTypes.portKey], name: "model_input_group_ports_port_fk" }).onDelete("cascade"),
  check("model_input_group_ports_input_only_check", sql`direction = 'input'`),
]);

export const workflows = pgTable("workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table): PgTableExtraConfigValue[] => [
  index("workflows_user_id_idx").on(table.userId),
  uniqueIndex("workflows_id_user_unique").on(table.id, table.userId),
]);

export const workflowJobs = pgTable("workflow_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workflowId: uuid("workflow_id").notNull(),
  name: text("name").notNull(),
  status: workflowJobStatus("status").notNull().default("active"),
  firstRunAt: timestamp("first_run_at", { withTimezone: true }).notNull(),
  intervalSeconds: integer("interval_seconds"),
  repeatCount: integer("repeat_count"),
  completedRuns: integer("completed_runs").notNull().default(0),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  currentRunId: uuid("current_run_id"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table): PgTableExtraConfigValue[] => [
  foreignKey({ columns: [table.workflowId, table.userId], foreignColumns: [workflows.id, workflows.userId], name: "workflow_jobs_workflow_owner_fk" }).onDelete("cascade"),
  check("workflow_jobs_repeat_check", sql`repeat_count IS NULL OR repeat_count >= 1`),
  check("workflow_jobs_interval_check", sql`(repeat_count = 1 AND interval_seconds IS NULL) OR ((repeat_count IS NULL OR repeat_count > 1) AND interval_seconds IS NOT NULL AND interval_seconds BETWEEN 60 AND 31536000)`),
  index("workflow_jobs_due_idx").on(table.status, table.nextRunAt),
  index("workflow_jobs_owner_idx").on(table.userId, table.createdAt),
]);

export const workflowNodes = pgTable("workflow_nodes", {
  workflowId: uuid("workflow_id").notNull(),
  nodeId: text("node_id").notNull(),
  userId: uuid("user_id").notNull(),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  modelId: text("model_id").references(() => models.id, { onDelete: "restrict" }),
  dataTypeId: text("data_type_id").references(() => dataTypes.id, { onDelete: "restrict" }),
  inputText: text("input_text").notNull().default(""),
  artifactId: uuid("artifact_id"),
  parameters: jsonb("parameters_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  positionX: real("position_x").notNull().default(0),
  positionY: real("position_y").notNull().default(0),
}, (table): PgTableExtraConfigValue[] => [
  primaryKey({ columns: [table.workflowId, table.nodeId], name: "workflow_nodes_pk" }),
  check("workflow_nodes_kind_check", sql`kind in ('input', 'model', 'processing')`),
  foreignKey({ columns: [table.workflowId, table.userId], foreignColumns: [workflows.id, workflows.userId], name: "workflow_nodes_workflow_owner_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.artifactId, table.userId], foreignColumns: [artifacts.id, artifacts.userId], name: "workflow_nodes_artifact_owner_fk" }).onDelete("restrict"),
]);

export const workflowEdges = pgTable("workflow_edges", {
  workflowId: uuid("workflow_id").notNull(),
  edgeId: text("edge_id").notNull(),
  userId: uuid("user_id").notNull(),
  sourceNodeId: text("source_node_id").notNull(),
  sourceHandle: text("source_handle"),
  targetNodeId: text("target_node_id").notNull(),
  targetHandle: text("target_handle"),
}, (table): PgTableExtraConfigValue[] => [
  primaryKey({ columns: [table.workflowId, table.edgeId], name: "workflow_edges_pk" }),
  foreignKey({ columns: [table.workflowId, table.userId], foreignColumns: [workflows.id, workflows.userId], name: "workflow_edges_workflow_owner_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.workflowId, table.sourceNodeId], foreignColumns: [workflowNodes.workflowId, workflowNodes.nodeId], name: "workflow_edges_source_node_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.workflowId, table.targetNodeId], foreignColumns: [workflowNodes.workflowId, workflowNodes.nodeId], name: "workflow_edges_target_node_fk" }).onDelete("cascade"),
]);

export const runs = pgTable("runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: "set null" }),
  jobId: uuid("job_id").references(() => workflowJobs.id, { onDelete: "set null" }),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  status: runStatus("status").notNull().default("queued"),
  inputJson: jsonb("input_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  workflowSnapshotJson: jsonb("workflow_snapshot_json").$type<Record<string, unknown>>().notNull(),
  errorSummary: text("error_summary"),
  attemptCount: integer("attempt_count").notNull().default(0),
  claimedBy: text("claimed_by"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table): PgTableExtraConfigValue[] => [
  index("runs_user_created_idx").on(table.userId, table.createdAt),
  index("runs_queue_idx").on(table.status, table.createdAt, table.leaseExpiresAt),
  uniqueIndex("runs_id_user_unique").on(table.id, table.userId),
  uniqueIndex("runs_job_scheduled_unique").on(table.jobId, table.scheduledFor).where(sql`${table.jobId} IS NOT NULL`),
  uniqueIndex("runs_one_active_job_run_unique").on(table.jobId).where(sql`${table.jobId} IS NOT NULL AND status IN ('queued', 'running', 'cancel_requested')`),
]);

export const runNodes = pgTable("run_nodes", {
  runId: uuid("run_id").notNull(),
  userId: uuid("user_id").notNull(),
  nodeId: text("node_id").notNull(),
  status: runNodeStatus("status").notNull().default("queued"),
  nodeSnapshotJson: jsonb("node_snapshot_json").$type<Record<string, unknown>>().notNull(),
  inputArtifactId: uuid("input_artifact_id"),
  parameters: jsonb("parameters_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  resolvedInputJson: jsonb("resolved_input_json").$type<Record<string, unknown>>(),
  outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
  errorCode: text("error_code"),
  errorSummary: text("error_summary"),
  attemptCount: integer("attempt_count").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table): PgTableExtraConfigValue[] => [
  primaryKey({ columns: [table.runId, table.nodeId], name: "run_nodes_pk" }),
  index("run_nodes_user_run_idx").on(table.userId, table.runId),
  foreignKey({ columns: [table.inputArtifactId, table.userId], foreignColumns: [artifacts.id, artifacts.userId], name: "run_nodes_input_artifact_owner_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.runId, table.userId], foreignColumns: [runs.id, runs.userId], name: "run_nodes_run_owner_fk" }).onDelete("cascade"),
]);

export const runDeletions = pgTable("run_deletions", {
  runId: uuid("run_id").primaryKey(),
  userId: uuid("user_id").notNull(),
  storageKeys: text("storage_keys").array().notNull().default(sql`'{}'::text[]`),
  candidateUploadIds: uuid("candidate_upload_ids").array().notNull().default(sql`'{}'::uuid[]`),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  claimedBy: text("claimed_by"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table): PgTableExtraConfigValue[] => [
  foreignKey({ columns: [table.runId, table.userId], foreignColumns: [runs.id, runs.userId], name: "run_deletions_run_owner_fk" }).onDelete("cascade"),
  index("run_deletions_queue_idx").on(table.nextAttemptAt, table.leaseExpiresAt),
]);

export const artifacts = pgTable("artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  runId: uuid("run_id"),
  runNodeId: text("run_node_id"),
  dataTypeId: text("data_type_id").notNull().references(() => dataTypes.id, { onDelete: "restrict" }),
  storageKey: text("storage_key").notNull().unique(),
  mediaType: text("media_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  checksum: text("checksum").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table): PgTableExtraConfigValue[] => [
  index("artifacts_user_created_idx").on(table.userId, table.createdAt),
  uniqueIndex("artifacts_id_user_unique").on(table.id, table.userId),
  foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "artifacts_user_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.runId, table.userId], foreignColumns: [runs.id, runs.userId], name: "artifacts_run_owner_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.runId, table.runNodeId], foreignColumns: [runNodes.runId, runNodes.nodeId], name: "artifacts_run_node_fk" }).onDelete("cascade"),
]);
