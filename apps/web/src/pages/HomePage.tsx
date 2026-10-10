import { Badge, Box, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import type { AppView } from "../App";
import { useAuth } from "../auth";

export function HomePage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { user, openLoginModal } = useAuth();
  return (
    <Stack className="home-page" gap="lg">
      <Group className="page-heading" justify="space-between" align="end">
        <Stack gap={3}>
          <Text className="page-eyebrow">Workspace</Text>
          <Title order={1} className="page-title">Home</Title>
        </Stack>
        <Text className="page-date">A fresh place to begin</Text>
      </Group>
      <Box component="section" className="welcome-panel">
        <Stack className="welcome-copy" gap="md">
          <Badge className="welcome-badge" color="hiveSky" variant="light">Welcome to Hive</Badge>
          <Stack gap="xs">
            <Title order={2} className="welcome-title">Coordinate AI agents in one workspace.</Title>
            <Text className="welcome-description">
              Hive is an AI orchestration workspace for reusable text, image, audio, and video agents. The goal is to connect agents into workflows and review each run’s outputs. Agent management is available now; workflow execution is coming next.
            </Text>
          </Stack>
          {!user && <Button w="fit-content" onClick={openLoginModal}>Log in to get started</Button>}
          <Group gap="xs" className="welcome-signature">
            <Text className="signature-mark" aria-hidden="true">&gt;_</Text>
            <Text size="sm" fw={550} c="hiveSky.3">A little room to grow</Text>
          </Group>
        </Stack>
      </Box>
      {user ? <Paper className="home-note" withBorder>
        <span className="note-mark" aria-hidden="true" />
        <Stack gap={2}>
          <Text fw={600} size="sm">Your workspace is ready.</Text>
          <Text size="sm" c="dimmed">Manage your agents or explore the workflow and run views.</Text>
        </Stack>
      </Paper> : <Paper className="home-note" withBorder>
        <span className="note-mark" aria-hidden="true" />
        <Stack gap={2}>
          <Text fw={600} size="sm">Sign in to access your private workspace.</Text>
          <Text size="sm" c="dimmed">Agents, workflows, and runs are available after you log in.</Text>
        </Stack>
      </Paper>}
      {user && <Group className="workspace-shortcuts" grow align="stretch">
        <Paper className="workspace-shortcut" withBorder onClick={() => onNavigate("agents")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate("agents"); }}>
          <Text fw={600}>Agents</Text><Text size="sm" c="dimmed">Define reusable model tasks and their inputs.</Text><Button variant="subtle" onClick={(event) => { event.stopPropagation(); onNavigate("agents"); }}>Browse agents</Button>
        </Paper>
        <Paper className="workspace-shortcut" withBorder onClick={() => onNavigate("workflows")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate("workflows"); }}>
          <Text fw={600}>Workflows</Text><Text size="sm" c="dimmed">Connect agents into reusable pipelines.</Text><Button variant="subtle" onClick={(event) => { event.stopPropagation(); onNavigate("workflows"); }}>Browse workflows</Button>
        </Paper>
        <Paper className="workspace-shortcut" withBorder onClick={() => onNavigate("runs")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate("runs"); }}>
          <Text fw={600}>Runs</Text><Text size="sm" c="dimmed">Track execution and review generated files.</Text><Button variant="subtle" onClick={(event) => { event.stopPropagation(); onNavigate("runs"); }}>View runs</Button>
        </Paper>
      </Group>}
    </Stack>
  );
}
