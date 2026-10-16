import { Button, Paper, Stack, Text, Title } from "@mantine/core";
import { useAuth } from "../auth";

export function HomePage() {
  const { user, openLoginModal } = useAuth();
  return (
    <Stack className="home-page" gap="lg">
      <Stack className="welcome-copy" gap="md">
        <Stack gap="xs">
          <Title order={2} className="welcome-title">Build workflows from models, inputs, and processing nodes.</Title>
          <Text className="welcome-description">
            Build workflows from typed inputs, downloadable AI models, reusable Custom Nodes with named public inputs and outputs, and deterministic Processing operations. Edit custom node logic once and reuse it across workflows, with interface changes flagged for attention. Overlay text on images or turn a still image into a 9:16 MP4 with optional soundtrack. Manage uploaded and generated files in the Media Library, publish Instagram posts and Reels, and schedule workflows as Jobs.
          </Text>
        </Stack>
        {!user && <Button w="fit-content" onClick={openLoginModal}>Log in to get started</Button>}
      </Stack>
      {user ? <Paper className="home-note" withBorder>
        <span className="note-mark" aria-hidden="true" />
        <Stack gap={2}>
          <Text fw={600} size="sm">Your workspace is ready.</Text>
          <Text size="sm" c="dimmed">Manage models, build workflows, browse and preserve media, publish to Instagram, schedule Jobs, and review run outputs.</Text>
        </Stack>
      </Paper> : <Paper className="home-note" withBorder>
        <span className="note-mark" aria-hidden="true" />
        <Stack gap={2}>
          <Text fw={600} size="sm">Sign in to access your private workspace.</Text>
          <Text size="sm" c="dimmed">Download models, build workflows with built-in Processing operations, save media, schedule Jobs, connect Instagram, and review generated media after you log in.</Text>
        </Stack>
      </Paper>}
    </Stack>
  );
}
