import { Burger, Group, Text } from "@mantine/core";
import { LoginButton } from "./LoginButton";

export function AppHeader({
  mobileNavOpened,
  onMobileNavToggle,
}: {
  mobileNavOpened: boolean;
  onMobileNavToggle: () => void;
}) {
  return (
    <Group className="header-inner" h="100%" justify="space-between" px={{ base: "md", sm: "xl" }}>
      <Group gap="md">
        <Group className="mobile-header-brand" gap="xs" wrap="nowrap" hiddenFrom="sm">
          <Burger
            opened={mobileNavOpened}
            onClick={onMobileNavToggle}
            size="sm"
            aria-label={mobileNavOpened ? "Close navigation" : "Open navigation"}
          />
          {mobileNavOpened && <Text className="brand-name">HAIVI</Text>}
        </Group>
        <Text className="header-context" visibleFrom="sm">A little room to grow</Text>
      </Group>
      <LoginButton />
    </Group>
  );
}
