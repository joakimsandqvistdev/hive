import { z } from "zod";

export const imageModelIdSchema = z.enum(["z-image-turbo", "qwen-image-edit-2511"]);
export const imageResolutionSchema = z.enum(["512x512", "768x768", "1024x1024", "512x768", "768x512"]);

export const defaultImageModelParameters = {
  modelId: "z-image-turbo",
  resolution: "512x512",
  seed: 42,
  randomizeSeed: true,
  steps: 9,
  trueCfgScale: 4,
} as const;

const imageModelParametersInputSchema = z.object({
  modelId: imageModelIdSchema.default(defaultImageModelParameters.modelId),
  resolution: imageResolutionSchema.default(defaultImageModelParameters.resolution),
  seed: z.number().int().min(0).max(2_147_483_647).default(defaultImageModelParameters.seed),
  randomizeSeed: z.boolean().default(defaultImageModelParameters.randomizeSeed),
  steps: z.number().int().min(4).max(50).optional(),
  trueCfgScale: z.number().min(0).max(10).default(4),
});

export const imageModelParametersSchema = imageModelParametersInputSchema.transform((parameters) => ({
  ...parameters,
  steps: parameters.steps ?? (parameters.modelId === "qwen-image-edit-2511" ? 40 : defaultImageModelParameters.steps),
})).superRefine((parameters, context) => {
  if (parameters.modelId === "z-image-turbo" && parameters.steps > 12) {
    context.addIssue({ code: "custom", path: ["steps"], message: "Z-Image-Turbo supports at most 12 steps in Hive." });
  }
});

export type ImageModelParameters = z.infer<typeof imageModelParametersSchema>;

export function dimensionsForResolution(resolution: ImageModelParameters["resolution"]) {
  const [width, height] = resolution.split("x").map(Number);
  return { width, height };
}
