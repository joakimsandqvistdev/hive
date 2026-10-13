export type AgentModality = "image";
export type AgentModelChoice = "image" | "qwen-image-edit-2511";

export const agentModalityOptions: Array<{ value: AgentModelChoice; label: string }> = [
  { value: "image", label: "Image (Z-Image-Turbo)" },
  { value: "qwen-image-edit-2511", label: "Image (Qwen-Image-Edit-2511)" },
];

export function agentModalityLabel(value: string, modelId?: unknown): string {
  if (value === "image" && modelId === "qwen-image-edit-2511") return "Image (Qwen-Image-Edit-2511)";
  return agentModalityOptions.find((option) => option.value === value)?.label ?? value;
}
