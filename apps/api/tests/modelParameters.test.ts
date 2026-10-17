import assert from "node:assert/strict";
import { test } from "node:test";
import { dimensionsForResolution, imageModelParametersSchema } from "../src/modelParameters.js";

test("supported image models accept configured dimensions and reject smaller sizes", () => {
  for (const modelId of ["z-image-turbo", "qwen-image-edit-2511", "instruct-pix2pix", "sd15-inpainting", "longcat-image-edit-turbo", "flux2-klein-4b", "sd15-base", "sdxl-base-1.0", "sd35-medium", "sdxl-turbo", "sana-sprint-06b"]) {
    const smallest = imageModelParametersSchema.parse({ modelId, resolution: "128x128" });
    assert.deepEqual(dimensionsForResolution(smallest.resolution), { width: 128, height: 128 });
    const selected = imageModelParametersSchema.parse({ modelId, resolution: "256x256" });
    assert.deepEqual(dimensionsForResolution(selected.resolution), { width: 256, height: 256 });
    const instagramPortrait = imageModelParametersSchema.parse({ modelId, resolution: "768x960" });
    assert.deepEqual(dimensionsForResolution(instagramPortrait.resolution), { width: 768, height: 960 });
    assert.equal(imageModelParametersSchema.parse({ modelId }).resolution, "512x512");
    assert.equal(imageModelParametersSchema.safeParse({ modelId, resolution: "64x64" }).success, false);
  }
  assert.equal(imageModelParametersSchema.parse({ modelId: "longcat-image-edit-turbo" }).steps, 8);
  assert.equal(imageModelParametersSchema.parse({ modelId: "flux2-klein-4b" }).steps, 4);
  assert.equal(imageModelParametersSchema.parse({ modelId: "sd15-base" }).steps, 30);
  assert.equal(imageModelParametersSchema.parse({ modelId: "sdxl-base-1.0" }).steps, 30);
  assert.equal(imageModelParametersSchema.parse({ modelId: "sd35-medium" }).steps, 40);
  assert.equal(imageModelParametersSchema.parse({ modelId: "sana-sprint-06b" }).steps, 2);
  assert.equal(imageModelParametersSchema.parse({ modelId: "sdxl-turbo" }).steps, 4);
  assert.equal(imageModelParametersSchema.safeParse({ modelId: "sdxl-turbo", steps: 5 }).success, false);
  assert.equal(imageModelParametersSchema.safeParse({ modelId: "sana-sprint-06b", steps: 0 }).success, false);
  assert.equal(imageModelParametersSchema.safeParse({ modelId: "longcat-image-edit-turbo", steps: 12 }).success, false);
});
