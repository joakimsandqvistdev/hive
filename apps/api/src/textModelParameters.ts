import { z } from "zod";

export const textModelIds = ["qwen3-0.6b", "qwen3-1.7b"] as const;
export const textModelParametersSchema = z.object({
  modelId: z.enum(textModelIds),
  instruction: z.string().trim().min(1).max(3000).default("Follow the instruction and write based on the connected text. Return only the requested text."),
  prefix: z.string().max(3000).default(""),
  suffix: z.string().max(3000).default(""),
  maxNewTokens: z.number().int().min(16).max(1024).default(256),
  temperature: z.number().min(0).max(2).default(0.8),
});
export type TextModelParameters = z.infer<typeof textModelParametersSchema>;

export function defaultTextModelParameters(modelId: TextModelParameters["modelId"]): TextModelParameters {
  return textModelParametersSchema.parse({ modelId });
}
