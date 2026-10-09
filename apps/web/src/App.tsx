import {
  Badge,
  Card,
  Container,
  Divider,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";

type Health = { status: string; database: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

  useEffect(() => {
    fetch(`${apiUrl}/api/health`)
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setHealth({ status: "unavailable", database: "unavailable" }));
  }, [apiUrl]);

  const apiConnected = health?.status === "ok";
  const databaseConnected = health?.database === "connected";

  return (
    <Container size="sm" className="shell">
      <Stack gap="xl">
        <Group gap="sm">
          <ThemeIcon color="lime" variant="light" radius="xl" size="md" aria-hidden="true">
            ✳
          </ThemeIcon>
          <Text className="eyebrow">Your project starts here</Text>
        </Group>

        <Stack gap="sm">
          <Title order={1} className="title">
            Welcome to <Text span inherit c="lime.4" fs="italic" className="brand-name">Hive.</Text>
          </Title>
          <Text className="intro">
            Your workspace is ready. A clean foundation for the ideas you’ll build next.
          </Text>
        </Stack>

        <Card withBorder radius="lg" padding="xl" className="status-card">
          <Stack gap="md">
            <Group gap="xs">
              <ThemeIcon
                color="lime"
                variant="filled"
                radius="xl"
                size={8}
                aria-hidden="true"
              />
              <Text className="status-heading">Local development</Text>
            </Group>

            <ServiceStatus label="Web app" status="Running · React + Vite" color="lime" />
            <Divider />
            <ServiceStatus
              label="API server"
              status={apiConnected ? "Connected · Express" : "Waiting · Express"}
              color={apiConnected ? "lime" : "yellow"}
            />
            <Divider />
            <ServiceStatus
              label="Database"
              status={databaseConnected ? "Connected · PostgreSQL" : "Start Docker to connect"}
              color={databaseConnected ? "lime" : "yellow"}
            />
          </Stack>
        </Card>

        <Text className="footer">Built to grow <span>·</span> Node · React · Postgres</Text>
      </Stack>
    </Container>
  );
}

function ServiceStatus({ label, status, color }: { label: string; status: string; color: string }) {
  return (
    <Group justify="space-between" className="service">
      <Text>{label}</Text>
      <Badge color={color} variant="light" radius="sm" className="service-badge">
        {status}
      </Badge>
    </Group>
  );
}
