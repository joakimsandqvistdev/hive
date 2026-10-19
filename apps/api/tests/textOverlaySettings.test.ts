import assert from "node:assert/strict";
import test from "node:test";
import { textOverlaySettingsSchema } from "../src/processingNodes.js";

test("legacy Text Overlay settings default to no background strip", () => {
  const parsed = textOverlaySettingsSchema.safeParse({ operationId: "text-overlay" });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.backgroundEnabled, false);
  assert.equal(parsed.data.backgroundColor, "#000000");
  assert.equal(parsed.data.backgroundOpacity, 0.7);
  assert.equal(parsed.data.backgroundPadding, 2);
});

test("Text Overlay accepts bounded full-width strip settings", () => {
  const parsed = textOverlaySettingsSchema.safeParse({
    operationId: "text-overlay",
    backgroundEnabled: true,
    backgroundColor: "#224466",
    backgroundOpacity: 0.55,
    backgroundPadding: 4.5,
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.backgroundEnabled, true);
  assert.equal(parsed.data.backgroundColor, "#224466");
  assert.equal(parsed.data.backgroundOpacity, 0.55);
  assert.equal(parsed.data.backgroundPadding, 4.5);
});

test("Text Overlay rejects invalid strip opacity, color, and padding", () => {
  for (const settings of [
    { backgroundOpacity: 1.1 },
    { backgroundColor: "red" },
    { backgroundPadding: 15.1 },
  ]) {
    assert.equal(textOverlaySettingsSchema.safeParse({ operationId: "text-overlay", ...settings }).success, false);
  }
});
