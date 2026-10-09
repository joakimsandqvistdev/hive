import { AppShell, Box, Burger, Group, Stack, Text } from "@mantine/core";
import { NavigationButton } from "./NavigationButton";

function HomeIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m3.5 10.75 8.5-7 8.5 7v9.5a.75.75 0 0 1-.75.75h-5.5v-6.5h-4.5V21h-5.5a.75.75 0 0 1-.75-.75v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type SideNavigationProps = {
  compact: boolean;
  mobileNavOpened: boolean;
  onMobileNavToggle: () => void;
  onDesktopNavToggle: () => void;
  onNavigate: () => void;
};

export function SideNavigation({
  compact,
  mobileNavOpened,
  onMobileNavToggle,
  onDesktopNavToggle,
  onNavigate,
}: SideNavigationProps) {
  return (
    <Stack className="side-navigation" data-compact={compact || undefined} justify="space-between" h="100%" gap="xl">
      <Stack gap="xl">
        <AppShell.Section className="brand-section">
          <Group className="brand-row" gap="xs" wrap="nowrap">
            <Burger
              className="mobile-sidebar-burger"
              opened={false}
              onClick={onMobileNavToggle}
              hiddenFrom="sm"
              size="sm"
              aria-label={mobileNavOpened ? "Close navigation" : "Open navigation"}
            />
            <Burger
              className="desktop-sidebar-burger"
              opened={false}
              onClick={onDesktopNavToggle}
              visibleFrom="sm"
              size="sm"
              aria-label={compact ? "Expand navigation" : "Collapse navigation"}
            />
            <Text className="brand-name" visibleFrom="sm" fw={750}>HAIVI</Text>
          </Group>
        </AppShell.Section>

        <Box component="nav" aria-label="Main navigation">
          <Text className="nav-caption">Workspace</Text>
          <Stack gap={5} mt="sm">
            <NavigationButton
              label="Home"
              active
              icon={<HomeIcon />}
              compact={compact}
              onClick={onNavigate}
            />
          </Stack>
        </Box>
      </Stack>

      <Text className="sidebar-note">A welcoming space to make your own.</Text>
    </Stack>
  );
}
