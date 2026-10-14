import assert from "node:assert/strict";
import test from "node:test";
import { createGraph } from "ionodes";
import { addWorkflowNode } from "../src/pages/ionodesWorkflowAdapter.ts";
import type { ModelIoContract } from "../src/modelIoTypes.ts";

test("Klein input and output image ports receive unique connector ids", () => {
  const imagePort = {
    dataTypeId: "image",
    dataTypeLabel: "Image",
    mediaType: "image/*",
    portKey: "image",
    label: "Image",
    transport: "connection" as const,
    minCount: 0,
    maxCount: 4,
    sortOrder: 1,
  };
  const contracts: ModelIoContract[] = [{
    modelId: "flux2-klein-4b",
    name: "FLUX.2 Klein 4B",
    modality: "image",
    inputs: [{ ...imagePort, direction: "input" }],
    outputs: [{ ...imagePort, direction: "output", transport: null, minCount: 1, maxCount: 1, sortOrder: 0 }],
    inputGroups: [],
  }];
  const graph = addWorkflowNode(createGraph("workflow"), {
    id: "klein-node",
    kind: "model",
    label: "FLUX.2 Klein 4B",
    modelId: "flux2-klein-4b",
    inputText: "",
    artifactId: null,
    parameters: {},
    position: { x: 0, y: 0 },
  }, contracts, [{ id: "image", label: "Image", mediaType: "image/*" }]);

  assert.deepEqual(graph.nodes[0]?.connectors.map(({ id }) => id), [
    "klein-node:input:image",
    "klein-node:output:image",
  ]);
});
