import assert from "node:assert/strict";
import { test } from "node:test";
import { validateWorkflowDefinition, workflowDefinitionSchema, type WorkflowDefinition } from "../src/workflowDefinition.js";
import type { ModelIoContract, ModelIoPort } from "../src/modelContracts.js";
const port = (portKey: string, dataTypeId: string, direction: "input" | "output", minCount = 1, maxCount = 1): ModelIoPort => ({ portKey, dataTypeId, direction, minCount, maxCount, label: portKey, dataTypeLabel: dataTypeId, mediaType: `${dataTypeId}/*`, transport: direction === "input" ? "connection" : null, sortOrder: 0 });
const catalog: ModelIoContract[] = [
  { modelId: "z-image-turbo", name: "Generate", modality: "image", inputs: [port("prompt", "text", "input")], outputs: [port("image", "image", "output")], inputGroups: [] },
  { modelId: "qwen-image-edit-2511", name: "Edit", modality: "image", inputs: [port("prompt", "text", "input"), port("image", "image", "input", 1, 10)], outputs: [port("image", "image", "output")], inputGroups: [] },
];
const input = (id: string, dataTypeId = "text") => ({ id, kind: "input" as const, label: id, dataTypeId: dataTypeId as "text" | "audio" | "image", inputText: dataTypeId === "text" ? "Describe the image" : "", position: { x: 0, y: 0 } });
const model = (id: string, modelId = "z-image-turbo") => ({ id, kind: "model" as const, label: id, modelId, inputText: "", parameters: {}, position: { x: 100, y: 0 } });
const edge = (id: string, source: string, target: string, sourceHandle = "output", targetHandle = "prompt") => ({ id, source, target, sourceHandle, targetHandle });

test("typed text and generated-image connections replace reusable configuration", () => {
  const definition = { nodes: [input("text"), model("generate"), model("edit", "qwen-image-edit-2511")], edges: [edge("a", "text", "generate"), edge("b", "text", "edit"), edge("c", "generate", "edit", "image", "image")] };
  assert.equal(validateWorkflowDefinition(workflowDefinitionSchema.parse(definition), catalog).ok, true);
});
test("model prompt is mandatory and cannot be supplied inline", () => {
  assert.deepEqual(validateWorkflowDefinition({ nodes: [model("generate")], edges: [] }, catalog), { ok: false, error: "invalid_input_counts" });
  assert.equal(workflowDefinitionSchema.safeParse({ nodes: [{ ...model("generate"), prompt: "inline" }], edges: [] }).success, false);
});
test("uploaded media must be supplied by its owner and match the canonical datatype", () => {
  const artifactId = "00000000-0000-4000-8000-000000000001";
  const nodes = [input("text"), { ...input("image", "image"), artifactId }, model("edit", "qwen-image-edit-2511")];
  const definition = { nodes, edges: [edge("a", "text", "edit"), edge("b", "image", "edit", "output", "image")] };
  assert.deepEqual(validateWorkflowDefinition(definition, catalog), { ok: false, error: "invalid_input" });
  assert.equal(validateWorkflowDefinition(definition, catalog, [{ id: artifactId, dataTypeId: "image", runId: null }]).ok, true);
  assert.deepEqual(validateWorkflowDefinition(definition, catalog, [{ id: artifactId, dataTypeId: "audio", runId: null }]), { ok: false, error: "invalid_input" });
});
test("datatype mismatches, duplicate prompt sources, and cycles are rejected", () => {
  const nodes = [input("a"), input("b"), model("generate")];
  assert.deepEqual(validateWorkflowDefinition({ nodes, edges: [edge("a", "a", "generate"), edge("b", "b", "generate")] }, catalog), { ok: false, error: "invalid_input_counts" });
  const definition: WorkflowDefinition = { nodes: [input("text"), model("one"), model("two")], edges: [edge("a", "text", "one"), edge("b", "one", "two", "image", "prompt")] };
  assert.deepEqual(validateWorkflowDefinition(definition, catalog), { ok: false, error: "incompatible_data_types" });
  assert.equal(workflowDefinitionSchema.safeParse({ nodes, edges: [edge("a", "a", "generate"), edge("b", "generate", "a", "image", "output")] }).success, false);
});
test("input-only text and audio workflows remain valid without downloaded models", () => {
  assert.equal(validateWorkflowDefinition({ nodes: [input("text")], edges: [] }, []).ok, true);
  const artifactId = "00000000-0000-4000-8000-000000000001";
  assert.equal(validateWorkflowDefinition({ nodes: [{ ...input("audio", "audio"), artifactId }], edges: [] }, [], [{ id: artifactId, dataTypeId: "audio", runId: null }]).ok, true);
});
