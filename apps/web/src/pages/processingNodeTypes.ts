import type { ModelIoContract } from "../modelIoTypes";

export const textOverlayDefaults = {
  operationId: "text-overlay",
  fontFamily: "Liberation Sans",
  fontSize: 48,
  fontWeight: 700,
  color: "#ffffff",
  placement: "bottom-center",
  alignment: "center",
  margin: 6,
  lineSpacing: 1.2,
} as const;

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

export function instagramPublishingContract(operationId: string): ModelIoContract | undefined {
  const reel = operationId === "instagram-reel";
  if (!reel && operationId !== "instagram-post") return undefined;
  return {
    modelId: operationId,
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
