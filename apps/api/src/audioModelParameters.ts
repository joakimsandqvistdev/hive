import { z } from "zod";

export const audioModelIds = ["kokoro-82m"] as const;
export const audioModelParametersSchema = z.object({
  modelId: z.literal("kokoro-82m"),
  voice: z.enum(["af_heart", "af_bella", "af_nicole", "af_sarah", "am_adam", "am_michael", "bf_emma", "bf_isabella", "bm_george", "bm_lewis"]).default("af_heart"),
  speed: z.number().min(0.5).max(2).default(1),
});
export type AudioModelParameters = z.infer<typeof audioModelParametersSchema>;
export function defaultAudioModelParameters(): AudioModelParameters { return audioModelParametersSchema.parse({ modelId: "kokoro-82m" }); }
