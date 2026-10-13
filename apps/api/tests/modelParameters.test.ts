import assert from "node:assert/strict";
import { test } from "node:test";
import { dimensionsForResolution, imageModelParametersSchema } from "../src/modelParameters.js";

test("both image models accept 256 square while preserving the default and rejecting smaller sizes", () => {
  for (const modelId of ["z-image-turbo", "qwen-image-edit-2511"]) {
    const selected = imageModelParametersSchema.parse({ modelId, resolution: "256x256" });
    assert.deepEqual(dimensionsForResolution(selected.resolution), { width: 256, height: 256 });
    assert.equal(imageModelParametersSchema.parse({ modelId }).resolution, "512x512");
    assert.equal(imageModelParametersSchema.safeParse({ modelId, resolution: "128x128" }).success, false);
  }
});
