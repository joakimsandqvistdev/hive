import { Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import type { AppView } from "../navigation/navigationState";
import { useAuth } from "../auth";

export function HomePage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { user, openLoginModal } = useAuth();
  return (
    <Stack className="home-page" gap="lg">
      <Stack className="welcome-copy" gap="md">
        <Stack gap="xs">
          <Title order={2} className="welcome-title">Connect models and inputs in one workspace.</Title>
          <Text className="welcome-description">
            Connect text, image, and audio inputs to downloaded models in visual workflows, run them locally, and set up jobs to run workflows once or repeat them on an interval. Track run progress and preview generated images, videos, and audio.
          </Text>
        </Stack>
        {!user && <Button w="fit-content" onClick={openLoginModal}>Log in to get started</Button>}
      </Stack>
      {user ? <Paper className="home-note" withBorder>
        <span className="note-mark" aria-hidden="true" />
        <Stack gap={2}>
          <Text fw={600} size="sm">Your workspace is ready.</Text>
          <Text size="sm" c="dimmed">Manage models, build workflows, automate runs with Jobs, and review your generated media.</Text>
        </Stack>
      </Paper> : <Paper className="home-note" withBorder>
        <span className="note-mark" aria-hidden="true" />
        <Stack gap={2}>
          <Text fw={600} size="sm">Sign in to access your private workspace.</Text>
          <Text size="sm" c="dimmed">Download models, build workflows, schedule jobs, and review generated media after you log in.</Text>
        </Stack>
      </Paper>}
      {user && <Group className="workspace-shortcuts" grow align="stretch">
        <Paper className="workspace-shortcut" withBorder onClick={() => onNavigate("models")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate("models"); }}>
          <Text fw={600}>Models</Text><Text size="sm" c="dimmed">Check requirements and download supported image models to the local runner.</Text><Button variant="subtle" onClick={(event) => { event.stopPropagation(); onNavigate("models"); }}>Browse models</Button>
        </Paper>
        <Paper className="workspace-shortcut" withBorder onClick={() => onNavigate("workflows")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate("workflows"); }}>
          <Text fw={600}>Workflows</Text><Text size="sm" c="dimmed">Build visual workflows from models and typed input nodes.</Text><Button variant="subtle" onClick={(event) => { event.stopPropagation(); onNavigate("workflows"); }}>Browse workflows</Button>
        </Paper>
        <Paper className="workspace-shortcut" withBorder onClick={() => onNavigate("jobs")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate("jobs"); }}>
          <Text fw={600}>Jobs</Text><Text size="sm" c="dimmed">Run a workflow once or repeat it after each previous run finishes. Pause or remove jobs any time.</Text><Button variant="subtle" onClick={(event) => { event.stopPropagation(); onNavigate("jobs"); }}>Manage jobs</Button>
        </Paper>
        <Paper className="workspace-shortcut" withBorder onClick={() => onNavigate("runs")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate("runs"); }}>
          <Text fw={600}>Runs</Text><Text size="sm" c="dimmed">Track progress and duration, stop active runs, and preview or download generated media.</Text><Button variant="subtle" onClick={(event) => { event.stopPropagation(); onNavigate("runs"); }}>View runs</Button>
        </Paper>
      </Group>}
    </Stack>
  );
}
