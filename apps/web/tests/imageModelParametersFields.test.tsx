import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultImageModelParameters, ImageModelParametersFields } from "../src/components/ImageModelParametersFields.tsx";

test("128 and 256 square are available in agent and node forms for both image models", () => {
  for (const modelId of ["z-image-turbo", "qwen-image-edit-2511"] as const) {
    for (const showModelSelect of [false, true]) {
      const html = renderToStaticMarkup(<MantineProvider><ImageModelParametersFields
        showModelSelect={showModelSelect}
        value={{ ...defaultImageModelParameters, modelId, resolution: "256x256" }}
        onChange={() => {}}
      /></MantineProvider>);
      assert.match(html, /256 × 256/);
      assert.match(html, /value="256x256"/);
      assert.match(html, /128 × 128 · low memory/);
      assert.match(html, /value="128x128"/);
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
