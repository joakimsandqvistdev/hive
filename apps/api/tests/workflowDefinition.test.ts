import assert from "node:assert/strict";
import { test } from "node:test";
import { validateWorkflowDefinition, type WorkflowAgentRecord, type WorkflowDefinition } from "../src/workflowDefinition.js";

const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

function validate(modelId: typeof modelIds[number], roles: Array<"image" | "mask">) {
  const nodes: WorkflowDefinition["nodes"] = [{ id: "target", agentId: uuid(1), position: { x: 0, y: 0 } }];
  const agents: WorkflowAgentRecord[] = [{ id: uuid(1), modality: "image", prompt: "edit", parameters: { modelId } }];
  const edges: WorkflowDefinition["edges"] = [];
  roles.forEach((role, index) => {
    const sourceId = `source-${index}`;
    const agentId = uuid(index + 2);
    nodes.push({ id: sourceId, agentId, position: { x: 0, y: index * 100 } });
    agents.push({ id: agentId, modality: "image", prompt: "generate", parameters: { modelId: "z-image-turbo" } });
    edges.push({ id: `edge-${index}`, source: sourceId, target: "target", ...(role === "mask" ? { targetHandle: "mask" } : { targetHandle: "image" }) });
  });
  return validateWorkflowDefinition({ nodes, edges }, agents);
}

test("workflow input counts match image model capabilities", () => {
  assert.equal(validate("z-image-turbo", []).ok, true);
  assert.equal(validate("qwen-image-edit-2511", ["image"]).ok, true);
  assert.equal(validate("instruct-pix2pix", ["image"]).ok, true);
  assert.equal(validate("longcat-image-edit-turbo", ["image"]).ok, true);
  assert.equal(validate("flux2-klein-4b", []).ok, true);
  assert.equal(validate("sd15-base", []).ok, true);
  assert.equal(validate("sdxl-base-1.0", []).ok, true);
  assert.equal(validate("sd35-medium", []).ok, true);
  assert.equal(validate("sdxl-turbo", []).ok, true);
  assert.equal(validate("sana-sprint-06b", []).ok, true);
  assert.equal(validate("flux2-klein-4b", ["image", "image", "image", "image"]).ok, true);
  assert.equal(validate("sd15-inpainting", ["image", "mask"]).ok, true);
});

test("editing workflows reject missing, excess, and mis-typed image inputs", () => {
  assert.deepEqual(validate("qwen-image-edit-2511", []), { ok: false, error: "invalid_reference_count" });
  assert.deepEqual(validate("instruct-pix2pix", []), { ok: false, error: "invalid_reference_count" });
  assert.deepEqual(validate("sd15-inpainting", ["image"]), { ok: false, error: "invalid_reference_count" });
  assert.deepEqual(validate("sd15-inpainting", ["mask", "mask"]), { ok: false, error: "invalid_reference_count" });
  assert.deepEqual(validate("longcat-image-edit-turbo", ["image", "image"]), { ok: false, error: "invalid_reference_count" });
  assert.deepEqual(validate("flux2-klein-4b", ["image", "image", "image", "image", "image"]), { ok: false, error: "invalid_reference_count" });
  assert.deepEqual(validate("qwen-image-edit-2511", Array.from({ length: 11 }, () => "image" as const)), { ok: false, error: "invalid_reference_count" });
});
