import assert from "node:assert/strict";
import test from "node:test";
import { canCleanupArtifact } from "../src/artifactCleanupPolicy.js";

const now = new Date("2026-10-17T12:00:00Z");
const old = new Date("2026-09-01T12:00:00Z");
const base = { runId: null, sourceWorkflowId: "workflow-1", savedToLibrary: false, createdAt: now, runStatus: null, protected: false };

test("allows an unreferenced workflow upload regardless of age", () => {
  assert.equal(canCleanupArtifact(base, ["orphaned-workflow-uploads"], now), true);
});

test("allows only unsaved terminal run outputs older than 30 days", () => {
  const candidate = { ...base, runId: "run-1", sourceWorkflowId: null, createdAt: old, runStatus: "failed" };
  assert.equal(canCleanupArtifact(candidate, ["old-run-outputs"], now), true);
  assert.equal(canCleanupArtifact({ ...candidate, runStatus: "running" }, ["old-run-outputs"], now), false);
  assert.equal(canCleanupArtifact({ ...candidate, createdAt: now }, ["old-run-outputs"], now), false);
});

test("saved or referenced artifacts are never eligible", () => {
  assert.equal(canCleanupArtifact({ ...base, savedToLibrary: true }, ["orphaned-workflow-uploads"], now), false);
  assert.equal(canCleanupArtifact({ ...base, protected: true }, ["orphaned-workflow-uploads"], now), false);
});

test("a run artifact cannot use the workflow upload scope", () => {
  assert.equal(canCleanupArtifact({ ...base, runId: "run-1", sourceWorkflowId: null }, ["orphaned-workflow-uploads"], now), false);
});
