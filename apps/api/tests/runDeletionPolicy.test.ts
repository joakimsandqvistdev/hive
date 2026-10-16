import assert from "node:assert/strict";
import test from "node:test";
import { canDeleteAwaitingPublishRun } from "../src/runDeletionPolicy.js";

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
