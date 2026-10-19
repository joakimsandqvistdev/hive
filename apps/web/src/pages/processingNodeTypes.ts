import type { ModelIoContract } from "../modelIoTypes";

export const textOverlayDefaults = {
  operationId: "text-overlay",
  fontFamily: "roboto",
  fontSize: 48,
  fontWeight: 700,
  fontStyle: "normal",
  fontAxes: {},
  color: "#ffffff",
  letterSpacing: 0,
  outlineColor: "#000000",
  outlineWidth: 3,
  outlineOpacity: 0.45,
  shadowColor: "#000000",
  shadowOpacity: 0,
  shadowBlur: 8,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  textDecoration: "none",
  backgroundEnabled: false,
  backgroundColor: "#000000",
  backgroundOpacity: 0.7,
  backgroundPadding: 2,
  placement: "bottom-center",
  alignment: "center",
  margin: 6,
  lineSpacing: 1.2,
} as const;

export const stillImageVideoDefaults = { operationId: "still-image-video", durationSeconds: 10, audioVolume: 100 } as const;

export const stillImageVideoContract: ModelIoContract = {
  modelId: "still-image-video", name: "Still Image Video", modality: "video",
  inputs: [
    { direction: "input", portKey: "image", dataTypeId: "image", dataTypeLabel: "Image", mediaType: "image/*", label: "Image", transport: "connection", minCount: 1, maxCount: 1, sortOrder: 0 },
    { direction: "input", portKey: "audio", dataTypeId: "audio", dataTypeLabel: "Audio", mediaType: "audio/*", label: "Audio (optional)", transport: "connection", minCount: 0, maxCount: 1, sortOrder: 1 },
  ],
  outputs: [{ direction: "output", portKey: "video", dataTypeId: "video", dataTypeLabel: "Video", mediaType: "video/mp4", label: "Video", transport: null, minCount: 1, maxCount: 1, sortOrder: 0 }],
  inputGroups: [],
};

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
