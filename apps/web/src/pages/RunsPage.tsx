import { Badge, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import type { AppView } from "../App";

export function RunsPage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  return (
    <Stack className="workspace-page" gap="lg">
      <Group justify="space-between" align="end">
        <Stack gap={3}><Text className="page-eyebrow">Workspace</Text><Title order={1} className="page-title">Runs</Title></Stack>
        <Badge color="hiveWarning" variant="light">Execution not connected</Badge>
      </Group>
      <Paper className="workspace-empty" withBorder>
        <Stack gap="sm" maw={600}>
          <Badge color="hiveSky" variant="light" w="fit-content">Run history</Badge>
          <Title order={2} size="h3">Runs and outputs will appear here</Title>
          <Text c="dimmed">Each run will capture a workflow version, show queued and per-agent progress, and keep generated files available for inspection. Failed steps, cancellation, and output downloads will be shown with the run.</Text>
          <Text size="sm" c="dimmed">Artifacts will be stored separately from workflow definitions and served only to their owner.</Text>
          <Group><Button variant="light" onClick={() => onNavigate("workflows")}>Browse workflows</Button><Button variant="subtle" onClick={() => onNavigate("agents")}>Browse agents</Button></Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
