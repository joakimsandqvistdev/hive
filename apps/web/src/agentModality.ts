export type AgentModality = "text" | "image" | "audio" | "video";

export const agentModalityOptions: Array<{ value: AgentModality; label: string }> = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image (Z-Image-Turbo)" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
];

export function agentModalityLabel(value: string): string {
  return agentModalityOptions.find((option) => option.value === value)?.label ?? value;
}
