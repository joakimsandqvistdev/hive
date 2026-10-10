import { Badge, Box, Group, Paper, Stack, Text, Title } from "@mantine/core";

export function HomePage() {
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
            <Title order={2} className="welcome-title">Make room for what matters.</Title>
            <Text className="welcome-description">
              A thoughtful home for the things you want to bring to life. This is your space to
              shape, one idea at a time.
            </Text>
          </Stack>
          <Group gap="xs" className="welcome-signature">
            <Text className="signature-mark" aria-hidden="true">&gt;_</Text>
            <Text size="sm" fw={550} c="hiveSky.3">A little room to grow</Text>
          </Group>
        </Stack>
      </Box>
      <Paper className="home-note" withBorder>
        <span className="note-mark" aria-hidden="true" />
        <Stack gap={2}>
          <Text fw={600} size="sm">Your home is ready.</Text>
          <Text size="sm" c="dimmed">Sign in whenever you’re ready to make this space yours.</Text>
        </Stack>
      </Paper>
    </Stack>
  );
}
