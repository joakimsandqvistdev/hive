import { AppShell, Box, Burger, Group, Stack, Text } from "@mantine/core";
import { NavigationButton } from "./NavigationButton";
import type { AppView } from "../navigation/navigationState";
import { useAuth } from "../auth";

function WorkflowIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><rect x="14.5" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7"/><path d="M9.5 7h4a2 2 0 0 1 2 2v5M14.5 17h-4a2 2 0 0 1-2-2v-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function RunsIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5.5h14M5 12h14M5 18.5h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="8" cy="5.5" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18.5" r="2" fill="currentColor"/></svg>; }
function JobsIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M8 3v4m8-4v4M4 9.5h16M8 13h3m-3 3h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function ModelsIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5 19.5 7v10L12 20.5 4.5 17V7L12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m4.8 7.2 7.2 3.5 7.2-3.5M12 10.7v9.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>; }
function LicenseIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.75h7l4 4v12.5H7a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M14 4v4h4M8.5 12h7M8.5 15.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }

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
              icon={<HomeIcon />}
              compact={compact}
              onClick={() => { onViewChange("home"); onNavigate(); }}
            />
          </Box>
          <Box>
            <Text className="nav-caption">Workspace</Text>
            <Stack gap={5} mt="sm">
            <NavigationButton label="Models" active={activeView === "models"} icon={<ModelsIcon />} compact={compact} onClick={() => { onViewChange("models"); onNavigate(); }} />
            {!loading && user && <>
              <NavigationButton label="Workflows" active={activeView === "workflows"} icon={<WorkflowIcon />} compact={compact} onClick={() => { onViewChange("workflows"); onNavigate(); }} />
              <NavigationButton label="Jobs" active={activeView === "jobs"} icon={<JobsIcon />} compact={compact} onClick={() => { onViewChange("jobs"); onNavigate(); }} />
              <NavigationButton label="Runs" active={activeView === "runs"} icon={<RunsIcon />} compact={compact} onClick={() => { onViewChange("runs"); onNavigate(); }} />
            </>}
            </Stack>
          </Box>
        </Box>
      </Stack>

      <Stack gap="xs">
        <Text className="sidebar-note">Connect models and inputs in workflows, and review their runs.</Text>
        <NavigationButton label="Licenses" active={activeView === "licenses"} icon={<LicenseIcon />} compact={compact} muted onClick={() => { onViewChange("licenses"); onNavigate(); }} />
      </Stack>
    </Stack>
  );
}
