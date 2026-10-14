import { NumberInput, Select, Stack, Text } from "@mantine/core";
import { RandomSeedFields } from "./RandomSeedFields";

export type VideoModelParameters = {
  modelId: "wan2.1-t2v-1.3b" | "cogvideox-2b";
  resolution: "832x480" | "720x480";
  frames: 25 | 41 | 49 | 61 | 81;
  fps: 16 | 8;
  seed: number;
  randomizeSeed: boolean;
  steps: number;
  guidanceScale: number;
};

export function defaultVideoModelParameters(modelId: VideoModelParameters["modelId"]): VideoModelParameters {
  return modelId === "wan2.1-t2v-1.3b"
    ? { modelId, resolution: "832x480", frames: 41, fps: 16, seed: 42, randomizeSeed: true, steps: 20, guidanceScale: 6 }
    : { modelId, resolution: "720x480", frames: 49, fps: 8, seed: 42, randomizeSeed: true, steps: 20, guidanceScale: 6 };
}

export function VideoModelParametersFields({ value, onChange }: {
  value: VideoModelParameters;
  onChange: (value: VideoModelParameters) => void;
}) {
  const isWan = value.modelId === "wan2.1-t2v-1.3b";
  const frameOptions = isWan
    ? [{ value: "41", label: "2.5 seconds · 41 frames" }, { value: "61", label: "3.75 seconds · 61 frames" }, { value: "81", label: "5 seconds · 81 frames" }]
    : [{ value: "25", label: "3 seconds · 25 frames" }, { value: "49", label: "6 seconds · 49 frames" }];
  return <Stack gap="sm">
    <Text size="xs" c="dimmed">
      {isWan ? "Text-to-video · 832 × 480 · 16 fps" : "Text-to-video · 720 × 480 · 8 fps"}. Video nodes do not take image connections.
    </Text>
    <Select label="Clip length" data={frameOptions} value={String(value.frames)} onChange={(frames) => {
      if (!frames) return;
      onChange({ ...value, frames: Number(frames) } as VideoModelParameters);
    }} allowDeselect={false} />
    <RandomSeedFields value={value} onChange={onChange} />
    <NumberInput label="Inference steps" description="More steps can improve detail but take longer." value={value.steps} onChange={(steps) => onChange({ ...value, steps: typeof steps === "number" ? steps : Number.parseInt(steps, 10) || 1 })} min={1} max={50} />
    <NumberInput label="Guidance scale" description={isWan ? "Wan2.1 T2V 1.3B default is 6." : "CogVideoX default is 6."} value={value.guidanceScale} onChange={(guidanceScale) => onChange({ ...value, guidanceScale: typeof guidanceScale === "number" ? guidanceScale : Number.parseFloat(guidanceScale) || 0 })} min={0} max={20} step={0.1} />
  </Stack>;
}
