import { AppShell, Box, Burger, Group, Stack, Text } from "@mantine/core";
import { NavigationButton } from "./NavigationButton";
import { AppIcon } from "./AppIcon";
import type { AppView } from "../navigation/navigationState";
import { useAuth } from "../auth";

type SideNavigationProps = {
  compact: boolean;
  mobileNavOpened: boolean;
  onMobileNavToggle: () => void;
  onDesktopNavToggle: () => void;
  onNavigate: () => void;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
};

export function SideNavigation({
  compact,
  mobileNavOpened,
  onMobileNavToggle,
  onDesktopNavToggle,
  onNavigate,
  activeView,
  onViewChange,
}: SideNavigationProps) {
  const { user, loading } = useAuth();
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
            <Text className="brand-name" visibleFrom="sm" fw={750}>HIVE</Text>
          </Group>
        </AppShell.Section>

        <Box component="nav" aria-label="Main navigation">
          <Box className="side-nav-home-section">
            <NavigationButton
              label="Home"
              active={activeView === "home"}
              icon={<AppIcon name="home" />}
              compact={compact}
              onClick={() => { onViewChange("home"); onNavigate(); }}
            />
          </Box>
          <Box>
            <Text className="nav-caption">Workspace</Text>
            <Stack gap={5} mt="sm">
            {!loading && user && <NavigationButton label="Accounts" active={activeView === "accounts"} icon={<AppIcon name="accounts" />} compact={compact} onClick={() => { onViewChange("accounts"); onNavigate(); }} />}
            {!loading && user && <NavigationButton label="Media Library" active={activeView === "media"} icon={<AppIcon name="media" />} compact={compact} onClick={() => { onViewChange("media"); onNavigate(); }} />}
            <NavigationButton label="Models" active={activeView === "models"} icon={<AppIcon name="models" />} compact={compact} onClick={() => { onViewChange("models"); onNavigate(); }} />
            {!loading && user && <>
              <NavigationButton label="Workflows" active={activeView === "workflows"} icon={<AppIcon name="workflows" />} compact={compact} onClick={() => { onViewChange("workflows"); onNavigate(); }} />
              <NavigationButton label="Custom Nodes" active={activeView === "custom-nodes"} icon={<AppIcon name="customNodes" />} compact={compact} onClick={() => { onViewChange("custom-nodes"); onNavigate(); }} />
              <NavigationButton label="Jobs" active={activeView === "jobs"} icon={<AppIcon name="jobs" />} compact={compact} onClick={() => { onViewChange("jobs"); onNavigate(); }} />
              <NavigationButton label="Runs" active={activeView === "runs"} icon={<AppIcon name="runs" />} compact={compact} onClick={() => { onViewChange("runs"); onNavigate(); }} />
            </>}
            </Stack>
          </Box>
        </Box>
      </Stack>

      <Stack gap="xs">
        <Text className="sidebar-note">Connect models and inputs in workflows, and review their runs.</Text>
        <NavigationButton label="Licenses" active={activeView === "licenses"} icon={<AppIcon name="licenses" />} compact={compact} muted onClick={() => { onViewChange("licenses"); onNavigate(); }} />
      </Stack>
    </Stack>
  );
}
