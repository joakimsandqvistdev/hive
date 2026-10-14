export type AgentModality = "image" | "video";
export type AgentModelChoice = "image" | "qwen-image-edit-2511" | "instruct-pix2pix" | "sd15-inpainting" | "longcat-image-edit-turbo" | "flux2-klein-4b" | "sd15-base" | "sdxl-base-1.0" | "sd35-medium" | "sdxl-turbo" | "sana-sprint-06b" | "wan2.1-t2v-1.3b" | "cogvideox-2b";

export const agentModalityOptions: Array<{ value: AgentModelChoice; label: string }> = [
  { value: "image", label: "Image (Z-Image-Turbo)" },
  { value: "qwen-image-edit-2511", label: "Image (Qwen-Image-Edit-2511)" },
  { value: "instruct-pix2pix", label: "Image (InstructPix2Pix)" },
  { value: "sd15-inpainting", label: "Image (SD 1.5 Inpainting)" },
  { value: "longcat-image-edit-turbo", label: "Image (LongCat Edit Turbo)" },
  { value: "flux2-klein-4b", label: "Image (FLUX.2 Klein 4B)" },
  { value: "sd15-base", label: "Image (Stable Diffusion 1.5)" },
  { value: "sdxl-base-1.0", label: "Image (SDXL Base 1.0)" },
  { value: "sd35-medium", label: "Image (Stable Diffusion 3.5 Medium)" },
  { value: "sdxl-turbo", label: "Image (SDXL-Turbo)" },
  { value: "sana-sprint-06b", label: "Image (Sana Sprint 0.6B)" },
  { value: "wan2.1-t2v-1.3b", label: "Video (Wan2.1 T2V 1.3B)" },
  { value: "cogvideox-2b", label: "Video (CogVideoX-2B)" },
];

export function agentModalityLabel(value: string, modelId?: unknown): string {
  if (value === "image" || value === "video") return agentModalityOptions.find((option) => option.value === (value === "image" && modelId === "z-image-turbo" ? "image" : modelId))?.label ?? (value === "video" ? "Video" : "Image");
  return agentModalityOptions.find((option) => option.value === value)?.label ?? value;
}
