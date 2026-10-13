import { Alert, Button, Group, Loader, Stack, Text } from "@mantine/core";

type ModelDownloadPromptProps = {
  status: "checking" | "ready" | "unavailable";
  onOpenModels: () => void;
  onClose: () => void;
};

export function ModelDownloadPrompt({ status, onOpenModels, onClose }: ModelDownloadPromptProps) {
  return <Stack gap="md">
    {status === "checking" ? <Group gap="xs"><Loader size="xs" /><Text size="sm">Checking downloaded models…</Text></Group>
      : status === "unavailable" ? <Alert color="hiveError" title="Model status unavailable">Could not check which models are downloaded.</Alert>
        : <Text size="sm">No models are downloaded yet.</Text>}
    <Group justify="space-between">
      <Button variant="light" type="button" onClick={onOpenModels}>Go to Models</Button>
      <Button variant="default" type="button" onClick={onClose}>Close</Button>
    </Group>
  </Stack>;
}
