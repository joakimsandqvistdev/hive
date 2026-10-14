import { NumberInput, Stack, Switch } from "@mantine/core";

type SeedSettings = { seed: number; randomizeSeed: boolean };

export function RandomSeedFields<T extends SeedSettings>({ value, onChange }: {
  value: T;
  onChange: (value: T) => void;
}) {
  return <Stack gap="sm">
    <Switch label="Randomize seed for each run" checked={value.randomizeSeed} onChange={(event) => onChange({ ...value, randomizeSeed: event.currentTarget.checked })} />
    <NumberInput label="Seed" description={value.randomizeSeed ? "A fresh seed is generated for each run." : "The same seed makes this generation repeatable."} value={value.seed} onChange={(seed) => onChange({ ...value, seed: typeof seed === "number" ? seed : Number.parseInt(seed, 10) || 0 })} min={0} max={2_147_483_647} disabled={value.randomizeSeed} />
  </Stack>;
}
