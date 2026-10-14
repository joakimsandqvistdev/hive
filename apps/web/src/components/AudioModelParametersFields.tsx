import { NumberInput, Select, Stack, Text } from "@mantine/core";

export type AudioModelParameters = {
  modelId: "kokoro-82m";
  voice: string;
  speed: number;
};

export const defaultAudioModelParameters: AudioModelParameters = { modelId: "kokoro-82m", voice: "af_heart", speed: 1 };

const voices = [
  { value: "af_heart", label: "Heart · American English · female" },
  { value: "af_bella", label: "Bella · American English · female" },
  { value: "af_nicole", label: "Nicole · American English · female" },
  { value: "af_sarah", label: "Sarah · American English · female" },
  { value: "am_adam", label: "Adam · American English · male" },
  { value: "am_michael", label: "Michael · American English · male" },
  { value: "bf_emma", label: "Emma · British English · female" },
  { value: "bf_isabella", label: "Isabella · British English · female" },
  { value: "bm_george", label: "George · British English · male" },
  { value: "bm_lewis", label: "Lewis · British English · male" },
];

export function AudioModelParametersFields({ value, onChange }: { value: AudioModelParameters; onChange: (value: AudioModelParameters) => void }) {
  return <Stack gap="sm">
    <Text size="xs" c="dimmed">Speech is generated from the text connected to the node’s Prompt input. Audio is returned as a WAV file.</Text>
    <Select label="Voice" data={voices} value={value.voice} onChange={(voice) => { if (voice) onChange({ ...value, voice }); }} allowDeselect={false} />
    <NumberInput label="Speech speed" description="1 is the default pace." value={value.speed} onChange={(speed) => onChange({ ...value, speed: typeof speed === "number" ? speed : Number.parseFloat(speed) || 1 })} min={0.5} max={2} step={0.1} decimalScale={1} />
  </Stack>;
}
