import { NumberInput, Select, Stack, Text } from "@mantine/core";
import { RandomSeedFields } from "./RandomSeedFields";

export type ImageModelParameters = {
  modelId: "z-image-turbo" | "qwen-image-edit-2511" | "instruct-pix2pix" | "sd15-inpainting" | "longcat-image-edit-turbo" | "flux2-klein-4b" | "sd15-base" | "sdxl-base-1.0" | "sd35-medium" | "sdxl-turbo" | "sana-sprint-06b";
  resolution: "128x128" | "256x256" | "512x512" | "768x768" | "1024x1024" | "512x768" | "768x512" | "1024x1280" | "768x1360";
  seed: number;
  randomizeSeed: boolean;
  steps: number;
  trueCfgScale: number;
  imageGuidanceScale: number;
  strength: number;
  guidanceScale: number;
};

export const defaultImageModelParameters: ImageModelParameters = {
  modelId: "z-image-turbo",
  resolution: "512x512",
  seed: 42,
  randomizeSeed: true,
  steps: 9,
  trueCfgScale: 4,
  imageGuidanceScale: 1.5,
  strength: 0.75,
  guidanceScale: 7.5,
};

export const imageModelOptions = [
  { value: "z-image-turbo", label: "Z-Image-Turbo" },
  { value: "qwen-image-edit-2511", label: "Qwen-Image-Edit-2511" },
  { value: "instruct-pix2pix", label: "InstructPix2Pix" },
  { value: "sd15-inpainting", label: "Stable Diffusion 1.5 Inpainting" },
  { value: "longcat-image-edit-turbo", label: "LongCat-Image-Edit-Turbo" },
  { value: "flux2-klein-4b", label: "FLUX.2 Klein 4B" },
  { value: "sd15-base", label: "Stable Diffusion 1.5" },
  { value: "sdxl-base-1.0", label: "SDXL Base 1.0" },
  { value: "sd35-medium", label: "Stable Diffusion 3.5 Medium" },
  { value: "sdxl-turbo", label: "SDXL-Turbo" },
  { value: "sana-sprint-06b", label: "Sana Sprint 0.6B" },
];

export function imageModelDefaultSteps(modelId: ImageModelParameters["modelId"]): number {
  if (modelId === "qwen-image-edit-2511") return 40;
  if (modelId === "longcat-image-edit-turbo") return 8;
  if (modelId === "sd35-medium") return 40;
  if (["sd15-base", "sdxl-base-1.0"].includes(modelId)) return 30;
  if (["flux2-klein-4b", "sdxl-turbo"].includes(modelId)) return 4;
  if (modelId === "sana-sprint-06b") return 2;
  return 9;
}

export const imageResolutionOptions = [
  { value: "128x128", label: "128 × 128 · low memory" },
  { value: "256x256", label: "256 × 256" },
  { value: "512x512", label: "512 × 512 · default" },
  { value: "768x768", label: "768 × 768" },
  { value: "1024x1024", label: "1024 × 1024" },
  { value: "512x768", label: "512 × 768 · portrait" },
  { value: "768x512", label: "768 × 512 · landscape" },
  { value: "1024x1280", label: "1024 × 1280 · Instagram portrait 4:5" },
  { value: "768x1360", label: "768 × 1360 · Instagram Reel 9:16" },
];

export function ImageModelParametersFields({ value, onChange, showModelSelect = true }: {
  value: ImageModelParameters;
  onChange: (value: ImageModelParameters) => void;
  showModelSelect?: boolean;
}) {
  return <Stack gap="sm">
    <Text size="xs" c="dimmed">Supply prompts and image data through the node’s connections.</Text>
    {showModelSelect && <Select label="Image model" data={imageModelOptions} value={value.modelId} onChange={(modelId) => {
      if (modelId && imageModelOptions.some((option) => option.value === modelId)) onChange({ ...value, modelId: modelId as ImageModelParameters["modelId"], steps: imageModelDefaultSteps(modelId as ImageModelParameters["modelId"]), trueCfgScale: 4, guidanceScale: modelId === "flux2-klein-4b" ? 1 : modelId === "sana-sprint-06b" || modelId === "sd35-medium" ? 4.5 : 7.5 });
    }} allowDeselect={false} />}
    <Stack gap={4}>
      {value.modelId === "qwen-image-edit-2511" && <Text size="xs" c="dimmed">Qwen-Image-Edit-2511 · Apache 2.0 · about 57.7 GB. Download it first from Models.</Text>}
      {value.modelId === "longcat-image-edit-turbo" && <Text size="xs" c="hiveWarning.8">Large model; CPU offload is slow and can require substantial system memory.</Text>}
      {value.modelId === "flux2-klein-4b" && <Text size="xs" c="hiveWarning.8">Its publisher recommends about 13 GB VRAM; CPU offload may increase system memory use and reduce speed.</Text>}
      {value.modelId === "sd35-medium" && <Text size="xs" c="hiveWarning.8">Large pipeline with three text encoders; Docker memory limits may need to be increased. Accept the Hugging Face terms and set HF_TOKEN in Hive’s .env before downloading.</Text>}
      {value.modelId === "sdxl-base-1.0" && <Text size="xs" c="hiveWarning.8">Higher memory use than SD 1.5; CPU offload may reduce VRAM needs at the cost of speed and system memory.</Text>}
      {value.modelId === "sana-sprint-06b" && <Text size="xs" c="hiveWarning.8">The published non-quantized path recommends 9 GB VRAM; Gemma encoder terms also apply.</Text>}
      {value.modelId === "sdxl-turbo" && <Text size="xs" c="hiveWarning.8">Non-commercial/research license. Commercial use requires separate Stability AI terms.</Text>}
    </Stack>
    {value.modelId !== "longcat-image-edit-turbo" && <Select label="Resolution" description={value.resolution === "128x128"
      ? value.modelId === "qwen-image-edit-2511"
        ? "Experimental for Qwen; its published demo starts at 256 × 256. Model memory needs may still exceed your hardware."
        : "Low resolution may reduce generation memory, but the model still needs memory to load."
      : undefined} data={imageResolutionOptions} value={value.resolution} onChange={(resolution) => {
      if (resolution) onChange({ ...value, resolution: resolution as ImageModelParameters["resolution"] });
    }} allowDeselect={false} />}
    {value.modelId === "longcat-image-edit-turbo" && <Text size="xs" c="dimmed">Output dimensions follow the connected source image.</Text>}
    <RandomSeedFields value={value} onChange={onChange} />
    {value.modelId !== "longcat-image-edit-turbo" && <NumberInput label="Inference steps" description={value.modelId === "z-image-turbo" ? "Z-Image-Turbo is tuned for 9 steps." : value.modelId === "qwen-image-edit-2511" ? "Qwen-Image-Edit-2511 default: 40 steps." : value.modelId === "sana-sprint-06b" ? "Sana Sprint uses 1–4 steps." : value.modelId === "sdxl-turbo" ? "SDXL-Turbo is designed for 1–4 steps." : "Diffusion denoising steps."} value={value.steps} onChange={(steps) => onChange({ ...value, steps: typeof steps === "number" ? steps : Number.parseInt(steps, 10) || 4 })} min={value.modelId === "sana-sprint-06b" || value.modelId === "sdxl-turbo" ? 1 : 4} max={value.modelId === "z-image-turbo" ? 12 : value.modelId === "sana-sprint-06b" || value.modelId === "sdxl-turbo" ? 4 : 50} />}
    {value.modelId === "qwen-image-edit-2511" && <NumberInput label="True CFG scale" description="Qwen edit pipeline guidance strength." value={value.trueCfgScale} onChange={(trueCfgScale) => onChange({ ...value, trueCfgScale: typeof trueCfgScale === "number" ? trueCfgScale : Number.parseFloat(trueCfgScale) || 0 })} min={0} max={10} step={0.1} />}
    {value.modelId === "instruct-pix2pix" && <NumberInput label="Image guidance scale" description="How strongly to preserve the source image." value={value.imageGuidanceScale} onChange={(imageGuidanceScale) => onChange({ ...value, imageGuidanceScale: typeof imageGuidanceScale === "number" ? imageGuidanceScale : Number.parseFloat(imageGuidanceScale) || 0 })} min={0} max={3} step={0.1} />}
    {value.modelId === "sd15-inpainting" && <NumberInput label="Edit strength" description="How much the masked image is changed." value={value.strength} onChange={(strength) => onChange({ ...value, strength: typeof strength === "number" ? strength : Number.parseFloat(strength) || 0 })} min={0} max={1} step={0.05} />}
    {(value.modelId === "sd15-inpainting" || value.modelId === "flux2-klein-4b" || value.modelId === "sd15-base" || value.modelId === "sdxl-base-1.0" || value.modelId === "sd35-medium" || value.modelId === "sana-sprint-06b") && <NumberInput label="Guidance scale" description="Prompt guidance strength." value={value.guidanceScale} onChange={(guidanceScale) => onChange({ ...value, guidanceScale: typeof guidanceScale === "number" ? guidanceScale : Number.parseFloat(guidanceScale) || 0 })} min={0} max={20} step={0.1} />}
  </Stack>;
}
