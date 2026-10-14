import { z } from "zod";

export const videoModelIds = ["wan2.1-t2v-1.3b", "cogvideox-2b"] as const;
export const videoModelIdSchema = z.enum(videoModelIds);

const commonParameters = {
  seed: z.number().int().min(0).max(2_147_483_647).default(42),
  randomizeSeed: z.boolean().default(true),
  steps: z.number().int().min(1).max(50).default(20),
  guidanceScale: z.number().min(0).max(20),
  negativePrompt: z.string().max(1000).default(""),
};

export const wanVideoParametersSchema = z.object({
  modelId: z.literal("wan2.1-t2v-1.3b"),
  resolution: z.literal("832x480").default("832x480"),
  frames: z.union([z.literal(41), z.literal(61), z.literal(81)]).default(41),
  fps: z.literal(16).default(16),
  ...commonParameters,
  guidanceScale: z.number().min(0).max(20).default(6),
});

export const cogVideoParametersSchema = z.object({
  modelId: z.literal("cogvideox-2b"),
  resolution: z.literal("720x480").default("720x480"),
  frames: z.union([z.literal(25), z.literal(49)]).default(49),
  fps: z.literal(8).default(8),
  ...commonParameters,
  guidanceScale: z.number().min(0).max(20).default(6),
});

export const videoModelParametersSchema = z.discriminatedUnion("modelId", [wanVideoParametersSchema, cogVideoParametersSchema]);
export type VideoModelParameters = z.infer<typeof videoModelParametersSchema>;

export function defaultVideoModelParameters(modelId: VideoModelParameters["modelId"]): VideoModelParameters {
  return modelId === "wan2.1-t2v-1.3b"
    ? wanVideoParametersSchema.parse({ modelId })
    : cogVideoParametersSchema.parse({ modelId });
}
