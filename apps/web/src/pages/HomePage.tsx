import { Badge, Group, Paper, Stack, Text, ThemeIcon, Title } from "@mantine/core";

export function HomePage() {
  return (
    <Stack className="home-page" gap="xl">
      <Group className="page-heading" justify="space-between" align="end">
        <Stack gap={4}>
          <Text className="page-eyebrow">Your workspace</Text>
          <Title order={1} className="page-title">Home</Title>
        </Stack>
        <Text className="page-date">A fresh place to begin</Text>
      </Group>

      <Paper className="welcome-panel" radius={28} withBorder>
        <Stack className="welcome-copy" justify="center" gap="lg">
          <Badge className="welcome-badge" color="hiveGreen" variant="light" radius="xl">
            Welcome to Hive
          </Badge>
          <Stack gap="sm">
            <Title order={2} className="welcome-title">
              Make room for what matters.
            </Title>
            <Text className="welcome-description">
              A thoughtful home for the things you want to bring to life. This is your space to
              shape, one idea at a time.
            </Text>
          </Stack>
          <Group gap="sm" className="welcome-signature">
            <ThemeIcon color="hiveCoral" variant="light" radius="xl" size={34} aria-hidden="true">
              <span className="signature-mark">✳</span>
            </ThemeIcon>
            <Text size="sm" fw={600} c="hiveGreen.8">A little room to grow</Text>
          </Group>
        </Stack>

        <div className="welcome-art" aria-hidden="true">
          <div className="art-orbit art-orbit-large" />
          <div className="art-orbit art-orbit-small" />
          <div className="art-leaf art-leaf-one" />
          <div className="art-leaf art-leaf-two" />
          <div className="art-spark art-spark-one">✳</div>
          <div className="art-spark art-spark-two">✦</div>
        </div>
      </Paper>

      <Paper className="home-note" radius="xl" withBorder>
        <div className="note-mark" aria-hidden="true">✳</div>
        <Stack gap={5}>
          <Text fw={650} c="hiveGreen.9">Your home is ready.</Text>
          <Text size="sm" c="dimmed">
            Sign in whenever you’re ready to make this space yours.
          </Text>
        </Stack>
      </Paper>
    </Stack>
  );
}
