import { z } from "zod";
import type { ModelIoContract } from "./modelContracts.js";
import { resolveGoogleFont } from "./googleFonts.js";

export const textOverlaySettingsSchema = z.object({
  operationId: z.literal("text-overlay").default("text-overlay"),
  fontFamily: z.string().default("roboto"),
  fontSize: z.number().int().min(8).max(256).default(48),
  fontWeight: z.number().int().min(100).max(1000).default(700),
  fontStyle: z.enum(["normal", "italic"]).default("normal"),
  fontAxes: z.record(z.string().regex(/^[a-zA-Z0-9]{4}$/), z.number().finite()).default({}),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  letterSpacing: z.number().min(-10).max(50).default(0),
  outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
  outlineWidth: z.number().min(0).max(20).default(3),
  outlineOpacity: z.number().min(0).max(1).default(0.45),
  shadowColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
  shadowOpacity: z.number().min(0).max(1).default(0),
  shadowBlur: z.number().min(0).max(40).default(8),
  shadowOffsetX: z.number().min(-100).max(100).default(2),
  shadowOffsetY: z.number().min(-100).max(100).default(2),
  textDecoration: z.enum(["none", "underline", "line-through"]).default("none"),
  placement: z.enum(["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"]).default("bottom-center"),
  alignment: z.enum(["left", "center", "right"]).default("center"),
  margin: z.number().int().min(0).max(30).default(6),
  lineSpacing: z.number().min(1).max(2).default(1.2),
}).strict().superRefine((settings, context) => {
  const font = resolveGoogleFont(settings.fontFamily);
  if (!font) { context.addIssue({ code: "custom", path: ["fontFamily"], message: "Choose a font from the Google Fonts catalog." }); return; }
  if (!font.axes && !font.weights.includes(settings.fontWeight)) context.addIssue({ code: "custom", path: ["fontWeight"], message: "This font does not provide the selected weight." });
  if (!font.axes && settings.fontStyle === "italic" && !font.styles.includes("italic")) context.addIssue({ code: "custom", path: ["fontStyle"], message: "This font does not provide an italic style." });
  for (const [tag, value] of Object.entries(settings.fontAxes)) {
    const axis = font.axes?.[tag];
    if (!axis) context.addIssue({ code: "custom", path: ["fontAxes", tag], message: "This font does not provide the selected axis." });
    else if (value < axis.min || value > axis.max) context.addIssue({ code: "custom", path: ["fontAxes", tag], message: "Axis value is outside this font's supported range." });
  }
});

export const stillImageVideoSettingsSchema = z.object({
  operationId: z.literal("still-image-video").default("still-image-video"),
  durationSeconds: z.number().int().min(3).max(900).default(10),
  audioVolume: z.number().int().min(0).max(100).default(100),
}).strict();
export type StillImageVideoSettings = z.infer<typeof stillImageVideoSettingsSchema>;

export const stillImageVideoContract: ModelIoContract = {
  modelId: "still-image-video",
  name: "Still Image Video",
  modality: "video",
  inputs: [
    { direction: "input", portKey: "image", dataTypeId: "image", dataTypeLabel: "Image", mediaType: "image/*", label: "Image", transport: "connection", minCount: 1, maxCount: 1, sortOrder: 0 },
    { direction: "input", portKey: "audio", dataTypeId: "audio", dataTypeLabel: "Audio", mediaType: "audio/*", label: "Audio (optional)", transport: "connection", minCount: 0, maxCount: 1, sortOrder: 1 },
  ],
  outputs: [{ direction: "output", portKey: "video", dataTypeId: "video", dataTypeLabel: "Video", mediaType: "video/mp4", label: "Video", transport: null, minCount: 1, maxCount: 1, sortOrder: 0 }],
  inputGroups: [],
};

export type TextOverlaySettings = z.infer<typeof textOverlaySettingsSchema>;

export const instagramPublishingSettingsSchema = z.object({
  operationId: z.enum(["instagram-post", "instagram-reel"]),
  accountId: z.string().uuid(),
  mode: z.enum(["automatic", "manual"]).default("manual"),
  shareToFeed: z.boolean().default(true),
}).strict();

export function instagramPublishingContract(parameters: Record<string, unknown>): ModelIoContract | undefined {
  const parsed = instagramPublishingSettingsSchema.safeParse(parameters);
  if (!parsed.success) return undefined;
  const reel = parsed.data.operationId === "instagram-reel";
  return {
    modelId: parsed.data.operationId,
    name: reel ? "Instagram Reel" : "Instagram Post",
    modality: reel ? "video" : "image",
    inputs: [
      { direction: "input", portKey: reel ? "video" : "image", dataTypeId: reel ? "video" : "image", dataTypeLabel: reel ? "Video" : "Image", mediaType: reel ? "video/mp4" : "image/*", label: reel ? "Video" : "Image", transport: "connection", minCount: 1, maxCount: 1, sortOrder: 0 },
      { direction: "input", portKey: "caption", dataTypeId: "text", dataTypeLabel: "Text", mediaType: "text/plain", label: "Caption", transport: "connection", minCount: 1, maxCount: 1, sortOrder: 1 },
    ],
    outputs: [],
    inputGroups: [],
  };
}

export const textOverlayContract: ModelIoContract = {
  modelId: "text-overlay",
  name: "Text Overlay",
  modality: "image",
  inputs: [
    { direction: "input", portKey: "image", dataTypeId: "image", dataTypeLabel: "Image", mediaType: "image/*", label: "Image", transport: "connection", minCount: 1, maxCount: 1, sortOrder: 0 },
    { direction: "input", portKey: "text", dataTypeId: "text", dataTypeLabel: "Text", mediaType: "text/plain", label: "Text", transport: "connection", minCount: 1, maxCount: 1, sortOrder: 1 },
  ],
  outputs: [{ direction: "output", portKey: "image", dataTypeId: "image", dataTypeLabel: "Image", mediaType: "image/png", label: "Image", transport: null, minCount: 1, maxCount: 1, sortOrder: 0 }],
  inputGroups: [],
};

export function processingContract(parameters: Record<string, unknown>): ModelIoContract | undefined {
  return parameters.operationId === "text-overlay" ? textOverlayContract : parameters.operationId === "still-image-video" ? stillImageVideoContract : undefined;
}

export function parseTextOverlaySettings(parameters: Record<string, unknown>): TextOverlaySettings {
  const parsed = textOverlaySettingsSchema.safeParse(parameters);
  if (!parsed.success) throw new Error("Text Overlay settings are invalid. Edit and save the workflow again.");
  return parsed.data;
}
