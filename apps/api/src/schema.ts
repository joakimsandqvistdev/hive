import { boolean, foreignKey, index, pgEnum, pgTable, primaryKey, real, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const agentModality = pgEnum("agent_modality", ["text", "image", "audio", "video"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  googleSubject: text("google_subject").notNull().unique(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("users_email_idx").on(table.email)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
  index("sessions_expires_at_idx").on(table.expiresAt),
]);

// Retained from the initial database migration so future schema diffs do not drop it.
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  modality: agentModality("modality").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("agents_user_created_idx").on(table.userId, table.createdAt),
  uniqueIndex("agents_id_user_unique").on(table.id, table.userId),
  uniqueIndex("agents_user_name_unique").on(table.userId, sql`lower(${table.name})`),
]);

export const workflows = pgTable("workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  index("workflows_user_id_idx").on(table.userId),
  uniqueIndex("workflows_id_user_unique").on(table.id, table.userId),
]);

export const workflowNodes = pgTable("workflow_nodes", {
  workflowId: uuid("workflow_id").notNull(),
  nodeId: text("node_id").notNull(),
  userId: uuid("user_id").notNull(),
  agentId: uuid("agent_id").notNull(),
  instructions: text("instructions").notNull().default(""),
  positionX: real("position_x").notNull().default(0),
  positionY: real("position_y").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.workflowId, table.nodeId], name: "workflow_nodes_pk" }),
  index("workflow_nodes_agent_id_idx").on(table.agentId),
  foreignKey({ columns: [table.workflowId, table.userId], foreignColumns: [workflows.id, workflows.userId], name: "workflow_nodes_workflow_owner_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.agentId, table.userId], foreignColumns: [agents.id, agents.userId], name: "workflow_nodes_agent_owner_fk" }).onDelete("restrict"),
]);

export const workflowEdges = pgTable("workflow_edges", {
  workflowId: uuid("workflow_id").notNull(),
  edgeId: text("edge_id").notNull(),
  userId: uuid("user_id").notNull(),
  sourceNodeId: text("source_node_id").notNull(),
  targetNodeId: text("target_node_id").notNull(),
}, (table) => [
  primaryKey({ columns: [table.workflowId, table.edgeId], name: "workflow_edges_pk" }),
  foreignKey({ columns: [table.workflowId, table.userId], foreignColumns: [workflows.id, workflows.userId], name: "workflow_edges_workflow_owner_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.workflowId, table.sourceNodeId], foreignColumns: [workflowNodes.workflowId, workflowNodes.nodeId], name: "workflow_edges_source_node_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.workflowId, table.targetNodeId], foreignColumns: [workflowNodes.workflowId, workflowNodes.nodeId], name: "workflow_edges_target_node_fk" }).onDelete("cascade"),
]);
