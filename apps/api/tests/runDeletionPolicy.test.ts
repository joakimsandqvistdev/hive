import assert from "node:assert/strict";
import test from "node:test";
import { bulkDeleteRunStatuses, canDeleteAwaitingPublishRun, isBulkDeleteRunStatus } from "../src/runDeletionPolicy.js";

test("allows queued runs in bulk deletion while keeping active statuses excluded", () => {
  assert.equal(bulkDeleteRunStatuses.includes("queued"), true);
  assert.equal(isBulkDeleteRunStatus("queued"), true);
  assert.equal(isBulkDeleteRunStatus("running"), false);
  assert.equal(isBulkDeleteRunStatus("cancel_requested"), false);
});

test("allows deletion when the publication is awaiting review", () => {
  assert.equal(canDeleteAwaitingPublishRun(["awaiting_review"]), true);
});

test("allows deletion of a queued publication so it can be discarded atomically", () => {
  assert.equal(canDeleteAwaitingPublishRun(["queued"]), true);
});

test("blocks deletion while an Instagram request is in progress", () => {
  assert.equal(canDeleteAwaitingPublishRun(["publishing"]), false);
});

test("blocks deletion for unknown publication states", () => {
  assert.equal(canDeleteAwaitingPublishRun(["unknown"]), false);
});
