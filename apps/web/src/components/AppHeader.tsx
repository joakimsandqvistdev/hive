import { Burger, Group, Text } from "@mantine/core";
import { AuthControl } from "./AuthControl";
import type { AppView } from "../navigation/navigationState";

const viewTitles: Record<AppView, string> = {
  home: "Home",
  workflows: "Workflows",
  jobs: "Jobs",
  runs: "Runs",
  models: "Models",
  licenses: "Open-source licenses",
};

export function AppHeader({
  view,
  mobileNavOpened,
  onMobileNavToggle,
}: {
  view: AppView;
  mobileNavOpened: boolean;
  onMobileNavToggle: () => void;
}) {
  return (
    <Group className="header-inner" h="100%" justify="space-between" px={{ base: "md", sm: "xl" }}>
      <Group gap="md" wrap="nowrap">
        <Group className="mobile-header-brand" gap="xs" wrap="nowrap" hiddenFrom="sm">
          <Burger
            opened={mobileNavOpened}
            onClick={onMobileNavToggle}
            size="sm"
            aria-label={mobileNavOpened ? "Close navigation" : "Open navigation"}
          />
        </Group>
        <Text className="header-context" fw={600} truncate>{viewTitles[view]}</Text>
      </Group>
      <AuthControl />
    </Group>
  );
}
