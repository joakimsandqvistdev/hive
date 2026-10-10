import { boolean, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
  currentVersion: integer("current_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  index("workflows_user_id_idx").on(table.userId),
  uniqueIndex("workflows_id_user_unique").on(table.id, table.userId),
]);

export const workflowVersions = pgTable("workflow_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  workflowId: uuid("workflow_id").notNull(),
  userId: uuid("user_id").notNull(),
  version: integer("version").notNull(),
  definitionJson: jsonb("definition_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("workflow_versions_workflow_version_unique").on(table.workflowId, table.version),
  uniqueIndex("workflow_versions_id_user_unique").on(table.id, table.userId),
  foreignKey({ columns: [table.workflowId, table.userId], foreignColumns: [workflows.id, workflows.userId], name: "workflow_versions_workflow_owner_fk" }).onDelete("cascade"),
]);

export const workflowVersionAgents = pgTable("workflow_version_agents", {
  workflowVersionId: uuid("workflow_version_id").notNull(),
  agentId: uuid("agent_id").notNull(),
  userId: uuid("user_id").notNull(),
}, (table) => [
  primaryKey({ columns: [table.workflowVersionId, table.agentId], name: "workflow_version_agents_pk" }),
  index("workflow_version_agents_agent_id_idx").on(table.agentId),
  foreignKey({ columns: [table.workflowVersionId, table.userId], foreignColumns: [workflowVersions.id, workflowVersions.userId], name: "workflow_version_agents_version_owner_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.agentId, table.userId], foreignColumns: [agents.id, agents.userId], name: "workflow_version_agents_agent_owner_fk" }).onDelete("restrict"),
]);
