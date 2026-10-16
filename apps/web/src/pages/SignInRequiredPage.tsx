import { Button, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { useAuth } from "../auth";

export function SignInRequiredPage({ loading = false }: { loading?: boolean }) {
  const { openLoginModal } = useAuth();

  return (
    <Stack className="workspace-page" gap="lg">
      <Paper className="workspace-empty sign-in-required" withBorder>
        {loading ? <Stack align="center" gap="sm"><Loader size="sm" color="hiveSky" /><Text c="dimmed">Checking your sign-in…</Text></Stack> : (
          <Stack gap="sm" maw={540}>
            <Title order={2} size="h3">Your workflows are private</Title>
            <Text c="dimmed">Sign in to connect inputs and models, build workflows, and review their runs. Your workspace is available only to you.</Text>
            <Button w="fit-content" onClick={openLoginModal}>Log in to your workspace</Button>
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
