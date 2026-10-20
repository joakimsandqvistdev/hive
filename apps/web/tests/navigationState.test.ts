import assert from "node:assert/strict";
import test from "node:test";
import {
  appViewFromHash,
  createNavigationState,
  isWorkflowEditorHash,
  toggleNavigationSidebar,
  transitionNavigationHash,
} from "../src/navigation/navigationState.ts";
import { nestedRouteBreadcrumb } from "../src/navigation/breadcrumbState.ts";

test("hashes resolve the workspace view and distinguish workflow editor routes", () => {
  assert.equal(appViewFromHash("#models"), "models");
  assert.equal(appViewFromHash("#workflows/workflow-123"), "workflows");
  assert.equal(appViewFromHash("#unknown"), "home");
  assert.equal(isWorkflowEditorHash("#workflows/workflow-123"), true);
  assert.equal(isWorkflowEditorHash("#workflows"), false);
});

test("nested routes get a parent breadcrumb and a safe label until page data loads", () => {
  assert.deepEqual(nestedRouteBreadcrumb("workflows", "#workflows/workflow-123"), { parentView: "workflows", currentLabel: "Workflow" });
  assert.deepEqual(nestedRouteBreadcrumb("custom-nodes", "#custom-nodes/node-123"), { parentView: "custom-nodes", currentLabel: "Custom node" });
  assert.deepEqual(nestedRouteBreadcrumb("runs", "#runs/run-123"), { parentView: "runs", currentLabel: "Run details" });
  assert.equal(nestedRouteBreadcrumb("workflows", "#workflows"), null);
  assert.equal(nestedRouteBreadcrumb("runs", "#workflows/workflow-123"), null);
});

test("entering and leaving an editor preserves the sidebar preference", () => {
  const expanded = createNavigationState("#workflows", false);
  const editing = transitionNavigationHash(expanded, "#workflows/workflow-123");
  assert.equal(editing.sidebarCollapsed, false);
  assert.equal(editing.workflowEditorActive, true);

  const returned = transitionNavigationHash(editing, "#workflows");
  assert.equal(returned.sidebarCollapsed, false);
  assert.equal(returned.workflowEditorActive, false);
});

test("a sidebar change inside the editor remains the preference after exit", () => {
  const initiallyCollapsed = createNavigationState("#models", true);
  const editing = transitionNavigationHash(initiallyCollapsed, "#workflows/workflow-123");
  const expandedInEditor = toggleNavigationSidebar(editing);
  assert.equal(expandedInEditor.sidebarCollapsed, false);

  const returned = transitionNavigationHash(expandedInEditor, "#workflows");
  assert.equal(returned.sidebarCollapsed, false);
});

test("a direct editor route respects the saved sidebar preference", () => {
  const directEditor = createNavigationState("#workflows/workflow-123", false);
  assert.equal(directEditor.sidebarCollapsed, false);
  assert.equal(transitionNavigationHash(directEditor, "#workflows").sidebarCollapsed, false);
});
