import { Badge, Button, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { useAuth } from "../auth";
import type { AppView } from "../navigation/navigationState";
import { AppIcon } from "../components/AppIcon";

const stages = [
  { icon: "accounts", number: "01", title: "Prepare", description: "Connect an Instagram account, organize media within storage quotas, and choose downloadable AI models for your work." },
  { icon: "workflows", number: "02", title: "Create", description: "Connect inputs, AI models, image and video tools, and reusable Custom Nodes in a visual workflow." },
  { icon: "jobs", number: "03", title: "Automate", description: "Run a workflow when you need it, on a schedule, or from a signed webhook trigger." },
  { icon: "publish", number: "04", title: "Publish", description: "Review workflow posts awaiting publish, then compose Instagram posts and carousels from saved images or approved runs." },
] as const;

export function HomePage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { user, openLoginModal } = useAuth();

  return <Stack className="home-page" gap="xl">
    <Paper className="home-hero" withBorder>
      <Stack className="home-hero-copy" gap="md">
        <Badge className="home-eyebrow" variant="light" color="hiveSky" leftSection={<span className="home-eyebrow-mark" aria-hidden="true" />}>Creative workflow automation</Badge>
        <Stack gap="sm">
          <Title order={1} className="home-title">Plan it. Make it. Know what happened.</Title>
          <Text className="home-description">Hive brings the pieces of creative automation together, so you can create a workflow and understand each step along the way.</Text>
        </Stack>
        <Group gap="sm" className="home-actions">
          {user
            ? <Button onClick={() => onNavigate("workflows")}>Explore workflows</Button>
            : <Button onClick={openLoginModal}>Sign in to Hive</Button>}
          {!user && <Text size="sm" c="dimmed">Your workspace is private to your account.</Text>}
        </Group>
      </Stack>

      <Paper className="home-flow-card" withBorder>
        <Group justify="space-between" align="center">
          <Text className="home-flow-label">How the pieces fit</Text>
          <span className="home-flow-status"><span aria-hidden="true" /> Connected</span>
        </Group>
        <Stack className="home-flow-steps" gap={0}>
          <FlowStep number="01" title="Prepare" description="Accounts · Models · Media" />
          <FlowStep number="02" title="Create" description="Workflows · Custom Nodes" />
          <FlowStep number="03" title="Automate" description="Jobs · Runs · Webhooks" />
          <FlowStep number="04" title="Publish" description="Review runs · Compose posts" last />
        </Stack>
        <Text className="home-flow-footnote">One clear path from setup through finished work</Text>
      </Paper>
    </Paper>

    <Stack className="home-capabilities" gap="md">
      <Stack gap={4}>
        <Title order={2} className="home-section-title">Hive, at each step</Title>
        <Text size="sm" c="dimmed">A quick map of what lives where.</Text>
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
        {stages.map((stage) => <Paper className="home-capability" withBorder key={stage.title}>
          <Group align="flex-start" wrap="nowrap" gap="sm">
            <ThemeIcon className="home-capability-icon" variant="light" color="hiveSky" size={38} radius="sm"><AppIcon name={stage.icon} size={19} /></ThemeIcon>
            <Stack gap={4}>
              <Text className="home-stage-number">{stage.number} — {stage.title.toUpperCase()}</Text>
              <Text className="home-capability-title">{stage.title}</Text>
              <Text className="home-capability-description">{stage.description}</Text>
            </Stack>
          </Group>
        </Paper>)}
      </SimpleGrid>

      <Paper className="home-capability-summary" withBorder>
        <Group align="flex-start" wrap="nowrap" gap="sm">
          <ThemeIcon className="home-capability-icon" variant="light" color="hiveSky" size={38} radius="sm"><AppIcon name="workflows" size={19} /></ThemeIcon>
          <Stack gap={4}>
            <Text className="home-capability-title">Built for a clear workflow</Text>
          <Text className="home-capability-description">Connect each step visually, reuse shared logic with Custom Nodes, and inspect or compare results in run history. Review workflow posts, then compose Instagram posts from saved Media Library images and approved runs.</Text>
          </Stack>
        </Group>
      </Paper>
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
