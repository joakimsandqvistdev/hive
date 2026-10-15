import { Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import type { AppView } from "../navigation/navigationState";
import { useAuth } from "../auth";

export function HomePage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { user, openLoginModal } = useAuth();
  return (
    <Stack className="home-page" gap="lg">
      <Stack className="welcome-copy" gap="md">
        <Stack gap="xs">
          <Title order={2} className="welcome-title">Build workflows from models, inputs, and processing nodes.</Title>
          <Text className="welcome-description">
            Combine typed text, image, and audio inputs with downloaded AI models and built-in Processing operations. Text Overlay renders connected text onto an image with configurable typography, without using an AI model. Publish generated Instagram posts and Reels automatically, or edit captions and publish after review. Run workflows locally or schedule one-time and repeating Jobs, then track progress and preview generated media.
          </Text>
        </Stack>
        {!user && <Button w="fit-content" onClick={openLoginModal}>Log in to get started</Button>}
      </Stack>
      {user ? <Paper className="home-note" withBorder>
        <span className="note-mark" aria-hidden="true" />
        <Stack gap={2}>
          <Text fw={600} size="sm">Your workspace is ready.</Text>
          <Text size="sm" c="dimmed">Manage models, build workflows, publish to Instagram, schedule Jobs, and review generated media.</Text>
        </Stack>
      </Paper> : <Paper className="home-note" withBorder>
        <span className="note-mark" aria-hidden="true" />
        <Stack gap={2}>
          <Text fw={600} size="sm">Sign in to access your private workspace.</Text>
          <Text size="sm" c="dimmed">Download models, build workflows with built-in Processing operations, schedule one-time or repeating Jobs, connect Instagram, and review generated media after you log in.</Text>
        </Stack>
      </Paper>}
      {user && <Group className="workspace-shortcuts" grow align="stretch">
        <Paper className="workspace-shortcut" withBorder onClick={() => onNavigate("accounts")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate("accounts"); }}>
          <Text fw={600}>Accounts</Text><Text size="sm" c="dimmed">Connect a professional Instagram account for workflow publishing and prepare profile pictures from Hive assets.</Text><Button variant="subtle" onClick={(event) => { event.stopPropagation(); onNavigate("accounts"); }}>Manage accounts</Button>
        </Paper>
        <Paper className="workspace-shortcut" withBorder onClick={() => onNavigate("models")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate("models"); }}>
          <Text fw={600}>Models</Text><Text size="sm" c="dimmed">Check requirements and download supported image models to the local runner.</Text><Button variant="subtle" onClick={(event) => { event.stopPropagation(); onNavigate("models"); }}>Browse models</Button>
        </Paper>
        <Paper className="workspace-shortcut" withBorder onClick={() => onNavigate("workflows")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate("workflows"); }}>
          <Text fw={600}>Workflows</Text><Text size="sm" c="dimmed">Connect typed inputs, AI models, and Processing operations; duplicate nodes or workflows to reuse a setup.</Text><Button variant="subtle" onClick={(event) => { event.stopPropagation(); onNavigate("workflows"); }}>Browse workflows</Button>
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
