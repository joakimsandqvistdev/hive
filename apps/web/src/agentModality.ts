export type AgentModality = "text" | "image" | "audio" | "video";
export type AgentModelChoice = AgentModality | "qwen-image-edit-2511";

export const agentModalityOptions: Array<{ value: AgentModelChoice; label: string }> = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image (Z-Image-Turbo)" },
  { value: "qwen-image-edit-2511", label: "Image (Qwen-Image-Edit-2511)" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
];

export function agentModalityLabel(value: string, modelId?: unknown): string {
  if (value === "image" && modelId === "qwen-image-edit-2511") return "Image (Qwen-Image-Edit-2511)";
  return agentModalityOptions.find((option) => option.value === value)?.label ?? value;
}
