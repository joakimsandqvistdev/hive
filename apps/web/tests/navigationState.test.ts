import assert from "node:assert/strict";
import test from "node:test";
import {
  appViewFromHash,
  createNavigationState,
  isWorkflowEditorHash,
  toggleNavigationSidebar,
  transitionNavigationHash,
} from "../src/navigation/navigationState.ts";

test("hashes resolve the workspace view and distinguish workflow editor routes", () => {
  assert.equal(appViewFromHash("#models"), "models");
  assert.equal(appViewFromHash("#workflows/workflow-123"), "workflows");
  assert.equal(appViewFromHash("#unknown"), "home");
  assert.equal(isWorkflowEditorHash("#workflows/workflow-123"), true);
  assert.equal(isWorkflowEditorHash("#workflows"), false);
});

test("entering an editor collapses the sidebar and leaving restores the previous preference", () => {
  const expanded = createNavigationState("#workflows", false);
  const editing = transitionNavigationHash(expanded, "#workflows/workflow-123");
  assert.equal(editing.sidebarCollapsed, true);
  assert.equal(editing.sidebarBeforeEditor, false);

  const returned = transitionNavigationHash(editing, "#workflows");
  assert.equal(returned.sidebarCollapsed, false);
  assert.equal(returned.sidebarBeforeEditor, null);
});

test("a sidebar change inside the editor overwrites the preference restored on exit", () => {
  const initiallyCollapsed = createNavigationState("#models", true);
  const editing = transitionNavigationHash(initiallyCollapsed, "#workflows/workflow-123");
  const expandedInEditor = toggleNavigationSidebar(editing);
  assert.equal(expandedInEditor.sidebarCollapsed, false);
  assert.equal(expandedInEditor.sidebarBeforeEditor, false);

  const returned = transitionNavigationHash(expandedInEditor, "#workflows");
  assert.equal(returned.sidebarCollapsed, false);
});

test("a direct editor refresh keeps the saved pre-editor preference for the return trip", () => {
  const directEditor = createNavigationState("#workflows/workflow-123", true, false);
  assert.equal(directEditor.sidebarCollapsed, true);
  assert.equal(transitionNavigationHash(directEditor, "#workflows").sidebarCollapsed, false);
});
