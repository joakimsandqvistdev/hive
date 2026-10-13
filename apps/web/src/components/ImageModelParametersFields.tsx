import { NumberInput, Select, Stack, Switch, Text } from "@mantine/core";

export type ImageModelParameters = {
  modelId: "z-image-turbo" | "qwen-image-edit-2511";
  resolution: "256x256" | "512x512" | "768x768" | "1024x1024" | "512x768" | "768x512";
  seed: number;
  randomizeSeed: boolean;
  steps: number;
  trueCfgScale: number;
};

export const defaultImageModelParameters: ImageModelParameters = {
  modelId: "z-image-turbo",
  resolution: "512x512",
  seed: 42,
  randomizeSeed: true,
  steps: 9,
  trueCfgScale: 4,
};

export const imageModelOptions = [
  { value: "z-image-turbo", label: "Z-Image-Turbo" },
  { value: "qwen-image-edit-2511", label: "Qwen-Image-Edit-2511" },
];

export const imageResolutionOptions = [
  { value: "256x256", label: "256 × 256" },
  { value: "512x512", label: "512 × 512 · default" },
  { value: "768x768", label: "768 × 768" },
  { value: "1024x1024", label: "1024 × 1024" },
  { value: "512x768", label: "512 × 768 · portrait" },
  { value: "768x512", label: "768 × 512 · landscape" },
];

export function ImageModelParametersFields({ value, onChange, showModelSelect = true }: {
  value: ImageModelParameters;
  onChange: (value: ImageModelParameters) => void;
  showModelSelect?: boolean;
}) {
  return <Stack gap="sm">
    {showModelSelect && <Select label="Image model" data={imageModelOptions} value={value.modelId} onChange={(modelId) => {
      if (modelId === "z-image-turbo" || modelId === "qwen-image-edit-2511") onChange({ ...value, modelId, steps: modelId === "qwen-image-edit-2511" ? 40 : 9 });
    }} allowDeselect={false} />}
    {value.modelId === "qwen-image-edit-2511" && <Stack gap={4}>
      <Text size="xs" c="dimmed">Qwen-Image-Edit-2511 · Apache 2.0 · model download is about 57.7 GB.</Text>
      <Text size="xs" c="dimmed">Connect 1–10 image nodes as references. Their order follows the canvas, top to bottom and then left to right.</Text>
    </Stack>}
    <Select label="Resolution" data={imageResolutionOptions} value={value.resolution} onChange={(resolution) => {
      if (resolution) onChange({ ...value, resolution: resolution as ImageModelParameters["resolution"] });
    }} allowDeselect={false} />
    <Switch label="Randomize seed for each run" checked={value.randomizeSeed} onChange={(event) => onChange({ ...value, randomizeSeed: event.currentTarget.checked })} />
    <NumberInput label="Seed" description={value.randomizeSeed ? "A fresh seed is generated for each run." : "The same seed makes this generation repeatable."} value={value.seed} onChange={(seed) => onChange({ ...value, seed: typeof seed === "number" ? seed : Number.parseInt(seed, 10) || 0 })} min={0} max={2_147_483_647} disabled={value.randomizeSeed} />
    <NumberInput label="Inference steps" description={value.modelId === "z-image-turbo" ? "Z-Image-Turbo is tuned for 9 steps." : "Qwen-Image-Edit-2511 default: 40 steps."} value={value.steps} onChange={(steps) => onChange({ ...value, steps: typeof steps === "number" ? steps : Number.parseInt(steps, 10) || 4 })} min={4} max={value.modelId === "z-image-turbo" ? 12 : 50} />
    {value.modelId === "qwen-image-edit-2511" && <NumberInput label="True CFG scale" description="Qwen edit pipeline guidance strength." value={value.trueCfgScale} onChange={(trueCfgScale) => onChange({ ...value, trueCfgScale: typeof trueCfgScale === "number" ? trueCfgScale : Number.parseFloat(trueCfgScale) || 0 })} min={0} max={10} step={0.1} />}
  </Stack>;
}
