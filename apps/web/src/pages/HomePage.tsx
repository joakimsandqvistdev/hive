import { Badge, Button, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { useAuth } from "../auth";
import type { AppView } from "../navigation/navigationState";
import { AppIcon } from "../components/AppIcon";

const capabilities = [
  { icon: "workflows", title: "Visual workflows", description: "Connect inputs, AI models, and styled media processing in one flow." },
  { icon: "customNodes", title: "Reusable Custom Nodes", description: "Reuse shared workflow logic; deletion is blocked while referenced." },
  { icon: "models", title: "Model library", description: "Download supported models and use them in your workflows." },
  { icon: "media", title: "Media Library", description: "Upload, organize, and reuse assets across workflows." },
  { icon: "publish", title: "Instagram publishing", description: "Publish posts and Reels automatically or after review." },
  { icon: "jobs", title: "Jobs and Runs", description: "Schedule repeat runs, track progress, receive completion alerts, and delete finished runs without interrupting active work." },
  { icon: "webhook", title: "Secure webhook triggers", description: "Create signed triggers, search by workflow, and review delivery history." },
] as const;

export function HomePage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { user, openLoginModal } = useAuth();

  return <Stack className="home-page" gap="xl">
    <Paper className="home-hero" withBorder>
      <Stack className="home-hero-copy" gap="md">
        <Badge className="home-eyebrow" variant="light" color="hiveSky" leftSection={<span className="home-eyebrow-mark" aria-hidden="true" />}>Creative workflow automation</Badge>
        <Stack gap="sm">
          <Title order={1} className="home-title">Turn ideas into repeatable workflows.</Title>
          <Text className="home-description">Bring AI models, media processing, and publishing together in one visual workspace. Build reusable flows, schedule runs, trigger workflows from secure webhooks, and keep every output easy to find.</Text>
        </Stack>
        <Group gap="sm" className="home-actions">
          {user
            ? <Button onClick={() => onNavigate("workflows")}>Open workflows</Button>
            : <Button onClick={openLoginModal}>Sign in to Hive</Button>}
          {!user && <Text size="sm" c="dimmed">Your workspace is private to your account.</Text>}
        </Group>
      </Stack>

      <Paper className="home-flow-card" withBorder>
        <Group justify="space-between" align="center">
          <Text className="home-flow-label">A connected workflow</Text>
          <span className="home-flow-status"><span aria-hidden="true" /> Ready to run</span>
        </Group>
        <Stack className="home-flow-steps" gap={0}>
          <FlowStep number="01" title="Build" description="Connect models and media" />
          <FlowStep number="02" title="Run" description="Generate and process outputs" />
          <FlowStep number="03" title="Publish" description="Review or automate delivery" last />
        </Stack>
        <Text className="home-flow-footnote">From a single run to a scheduled job</Text>
      </Paper>
    </Paper>

    <Stack className="home-capabilities" gap="md">
      <Stack gap={4}>
        <Title order={2} className="home-section-title">Everything around your workflow</Title>
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
        {capabilities.map((item) => <Paper className="home-capability" withBorder key={item.title}>
          <Group align="flex-start" wrap="nowrap" gap="sm">
            <ThemeIcon className="home-capability-icon" variant="light" color="hiveSky" size={38} radius="sm"><AppIcon name={item.icon} size={19} /></ThemeIcon>
            <Stack gap={4}>
              <Text className="home-capability-title">{item.title}</Text>
              <Text className="home-capability-description">{item.description}</Text>
            </Stack>
          </Group>
        </Paper>)}
      </SimpleGrid>
    </Stack>
  </Stack>;
}
function FlowStep({ number, title, description, last = false }: { number: string; title: string; description: string; last?: boolean }) {
  return <Group className="home-flow-step" wrap="nowrap" align="stretch" gap="sm">
    <Stack className="home-flow-marker-column" align="center" gap={0}>
      <span className="home-flow-marker">{number}</span>
      {!last && <span className="home-flow-connector" aria-hidden="true" />}
    </Stack>
    <Stack className="home-flow-step-copy" gap={2}>
      <Text className="home-flow-step-title">{title}</Text>
      <Text className="home-flow-step-description">{description}</Text>
    </Stack>
  </Group>;
}
