import { z } from "zod";
import type { ModelIoContract } from "./modelContracts.js";

export const textOverlaySettingsSchema = z.object({
  operationId: z.literal("text-overlay").default("text-overlay"),
  fontFamily: z.enum(["Liberation Sans", "Liberation Serif", "Liberation Mono"]).default("Liberation Sans"),
  fontSize: z.number().int().min(8).max(256).default(48),
  fontWeight: z.union([z.literal(400), z.literal(700)]).default(700),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  placement: z.enum(["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"]).default("bottom-center"),
  alignment: z.enum(["left", "center", "right"]).default("center"),
  margin: z.number().int().min(0).max(30).default(6),
  lineSpacing: z.number().min(1).max(2).default(1.2),
}).strict();

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
  return parameters.operationId === "text-overlay" ? textOverlayContract : undefined;
}

export function parseTextOverlaySettings(parameters: Record<string, unknown>): TextOverlaySettings {
  const parsed = textOverlaySettingsSchema.safeParse(parameters);
  if (!parsed.success) throw new Error("Text Overlay settings are invalid. Edit and save the workflow again.");
  return parsed.data;
}
