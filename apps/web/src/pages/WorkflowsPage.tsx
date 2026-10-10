import { Badge, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import type { AppView } from "../App";

export function WorkflowsPage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  return (
    <Stack className="workspace-page" gap="lg">
      <Group justify="space-between" align="end">
        <Stack gap={3}><Text className="page-eyebrow">Workspace</Text><Title order={1} className="page-title">Workflows</Title></Stack>
        <Button variant="light" onClick={() => onNavigate("agents")}>Add agents first</Button>
      </Group>
      <Paper className="workspace-empty" withBorder>
        <Stack gap="sm" maw={600}>
          <Badge color="hiveSky" variant="light" w="fit-content">Workflow library</Badge>
          <Title order={2} size="h3">Compose agents into a reusable flow</Title>
          <Text c="dimmed">Workflows will be directed graphs. Connect an agent’s typed output to another agent’s input, validate the graph, and save immutable versions so active runs keep their original configuration.</Text>
          <Text size="sm" c="dimmed">Start by defining at least one agent.</Text>
          <Group><Button variant="light" onClick={() => onNavigate("agents")}>View agents</Button><Button variant="subtle" onClick={() => onNavigate("runs")}>View runs</Button></Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
