import { NumberInput, Stack, Textarea } from "@mantine/core";

export type TextModelParameters = { modelId: "qwen3-0.6b" | "qwen3-1.7b"; instruction: string; prefix: string; suffix: string; maxNewTokens: number; temperature: number };

export const defaultTextModelParameters: TextModelParameters = {
  modelId: "qwen3-0.6b",
  instruction: "Follow the instruction and write based on the connected text. Return only the requested text.",
  prefix: "",
  suffix: "",
  maxNewTokens: 256,
  temperature: 0.8,
};

export function TextModelParametersFields({ value, onChange }: { value: TextModelParameters; onChange: (value: TextModelParameters) => void }) {
  return <Stack gap="sm">
    <Textarea label="Prefix" description="Text to add before the generated output." value={value.prefix ?? ""} maxLength={3000} minRows={2} autosize onChange={(event) => onChange({ ...value, prefix: event.currentTarget.value })} />
    <Textarea label="Instructions" description="Tell the model what to write from the connected text." value={value.instruction} maxLength={3000} minRows={3} autosize onChange={(event) => onChange({ ...value, instruction: event.currentTarget.value })} />
    <Textarea label="Suffix" description="Text to add after the generated output." value={value.suffix ?? ""} maxLength={3000} minRows={2} autosize onChange={(event) => onChange({ ...value, suffix: event.currentTarget.value })} />
    <NumberInput label="Maximum generated tokens" min={16} max={1024} step={16} value={value.maxNewTokens} onChange={(maxNewTokens) => typeof maxNewTokens === "number" && onChange({ ...value, maxNewTokens })} />
    <NumberInput label="Creativity" description="Higher values produce more varied text." min={0} max={2} step={0.1} decimalScale={1} value={value.temperature} onChange={(temperature) => typeof temperature === "number" && onChange({ ...value, temperature })} />
  </Stack>;
}
