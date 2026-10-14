import { z } from "zod";

export const imageModelIds = ["z-image-turbo", "qwen-image-edit-2511", "instruct-pix2pix", "sd15-inpainting", "longcat-image-edit-turbo", "flux2-klein-4b", "sd15-base", "sdxl-base-1.0", "sd35-medium", "sdxl-turbo", "sana-sprint-06b"] as const;
export const imageModelIdSchema = z.enum(imageModelIds);
export const imageResolutionSchema = z.enum(["128x128", "256x256", "512x512", "768x768", "1024x1024", "512x768", "768x512"]);

export const defaultImageModelParameters = {
  modelId: "z-image-turbo",
  resolution: "512x512",
  seed: 42,
  randomizeSeed: true,
  steps: 9,
  trueCfgScale: 4,
  imageGuidanceScale: 1.5,
  strength: 0.75,
  guidanceScale: 7.5,
} as const;

const imageModelParametersInputSchema = z.object({
  modelId: imageModelIdSchema.default(defaultImageModelParameters.modelId),
  resolution: imageResolutionSchema.default(defaultImageModelParameters.resolution),
  seed: z.number().int().min(0).max(2_147_483_647).default(defaultImageModelParameters.seed),
  randomizeSeed: z.boolean().default(defaultImageModelParameters.randomizeSeed),
  steps: z.number().int().min(1).max(50).optional(),
  trueCfgScale: z.number().min(0).max(10).default(4),
  imageGuidanceScale: z.number().min(0).max(3).default(1.5),
  strength: z.number().min(0).max(1).default(0.75),
  guidanceScale: z.number().min(0).max(20).default(7.5),
});

export const imageModelParametersSchema = imageModelParametersInputSchema.transform((parameters) => ({
  ...parameters,
  steps: parameters.steps ?? (parameters.modelId === "qwen-image-edit-2511" ? 40 : parameters.modelId === "longcat-image-edit-turbo" ? 8 : parameters.modelId === "sd35-medium" ? 40 : ["sd15-base", "sdxl-base-1.0"].includes(parameters.modelId) ? 30 : ["flux2-klein-4b", "sdxl-turbo"].includes(parameters.modelId) ? 4 : parameters.modelId === "sana-sprint-06b" ? 2 : defaultImageModelParameters.steps),
})).superRefine((parameters, context) => {
  if (!["sana-sprint-06b", "sdxl-turbo"].includes(parameters.modelId) && parameters.steps < 4) {
    context.addIssue({ code: "custom", path: ["steps"], message: "This model requires at least 4 inference steps." });
  }
  if (parameters.modelId === "z-image-turbo" && parameters.steps > 12) {
    context.addIssue({ code: "custom", path: ["steps"], message: "Z-Image-Turbo supports at most 12 steps in Hive." });
  }
  if (parameters.modelId === "longcat-image-edit-turbo" && parameters.steps !== 8) {
    context.addIssue({ code: "custom", path: ["steps"], message: "LongCat-Image-Edit-Turbo uses 8 inference steps." });
  }
  if (parameters.modelId === "sana-sprint-06b" && (parameters.steps < 1 || parameters.steps > 4)) {
    context.addIssue({ code: "custom", path: ["steps"], message: "Sana Sprint supports 1 to 4 inference steps." });
  }
  if (parameters.modelId === "sdxl-turbo" && (parameters.steps < 1 || parameters.steps > 4)) {
    context.addIssue({ code: "custom", path: ["steps"], message: "SDXL-Turbo supports 1 to 4 inference steps." });
  }
});

export type ImageModelParameters = z.infer<typeof imageModelParametersSchema>;

export function dimensionsForResolution(resolution: ImageModelParameters["resolution"]) {
  const [width, height] = resolution.split("x").map(Number);
  return { width, height };
}
