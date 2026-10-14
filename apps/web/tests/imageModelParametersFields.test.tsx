import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultImageModelParameters, imageModelDefaultSteps, imageResolutionOptions, ImageModelParametersFields } from "../src/components/ImageModelParametersFields.tsx";
import { modelGroups } from "../src/modelGroups.ts";

test("128 and 256 square are available in agent and node forms for both image models", () => {
  assert.ok(imageResolutionOptions.some((option) => option.value === "128x128"));
  assert.ok(imageResolutionOptions.some((option) => option.value === "256x256"));
  for (const modelId of ["z-image-turbo", "qwen-image-edit-2511", "instruct-pix2pix", "sd15-inpainting", "longcat-image-edit-turbo", "flux2-klein-4b", "sd15-base", "sdxl-base-1.0", "sd35-medium", "sdxl-turbo", "sana-sprint-06b"] as const) {
    for (const showModelSelect of [false, true]) {
      const html = renderToStaticMarkup(<MantineProvider><ImageModelParametersFields
        showModelSelect={showModelSelect}
        value={{ ...defaultImageModelParameters, modelId, resolution: "256x256" }}
        onChange={() => {}}
      /></MantineProvider>);
      if (modelId !== "longcat-image-edit-turbo") {
        assert.match(html, /256 × 256/);
        assert.match(html, /value="256x256"/);
      } else {
        assert.match(html, /dimensions follow the connected source image/i);
      }
    }
  }
});

test("Qwen agent and workflow node forms show the saved resolution", () => {
  for (const showModelSelect of [false, true]) {
    const html = renderToStaticMarkup(
      <MantineProvider>
        <ImageModelParametersFields
          showModelSelect={showModelSelect}
          value={{ ...defaultImageModelParameters, modelId: "qwen-image-edit-2511", resolution: "512x768", steps: 40 }}
          onChange={() => {}}
        />
      </MantineProvider>,
    );
    assert.match(html, /Resolution/);
    assert.match(html, /512 × 768/);
    assert.match(html, /value="512x768"/);
    assert.match(html, /True CFG scale/);
    assert.match(html, /Connect 1–10 image nodes/);
  }
});

test("text-to-image models use model-specific defaults and no-reference guidance", () => {
  assert.equal(imageModelDefaultSteps("sd15-base"), 30);
  assert.equal(imageModelDefaultSteps("sdxl-base-1.0"), 30);
  assert.equal(imageModelDefaultSteps("sd35-medium"), 40);
  assert.equal(imageModelDefaultSteps("sdxl-turbo"), 4);
  assert.equal(imageModelDefaultSteps("sana-sprint-06b"), 2);
  for (const modelId of ["sd15-base", "sdxl-base-1.0", "sd35-medium", "sdxl-turbo", "sana-sprint-06b"] as const) {
    const html = renderToStaticMarkup(<MantineProvider><ImageModelParametersFields value={{ ...defaultImageModelParameters, modelId }} onChange={() => {}} /></MantineProvider>);
    assert.match(html, /Text prompt only\.(?: Generates in 1–4 steps\.)? Connect no image nodes\./);
  }
});

test("Models page tab groups separate generation and editing without omitting models", () => {
  assert.deepEqual(modelGroups.map((group) => group.title), ["Text-to-image models", "Image-to-image and editing models"]);
  assert.deepEqual(modelGroups.map((group) => group.id), ["text-to-image", "image-to-image"]);
  const allModelIds = modelGroups.flatMap((group) => group.modelIds);
  assert.equal(allModelIds.length, 11);
  assert.equal(new Set(allModelIds).size, allModelIds.length);
  assert.ok(modelGroups[1].modelIds.includes("flux2-klein-4b"));
});
