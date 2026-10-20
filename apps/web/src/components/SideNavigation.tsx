import { AppShell, Box, Burger, Group, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { NavigationButton } from "./NavigationButton";
import { AppIcon } from "./AppIcon";
import type { AppView } from "../navigation/navigationState";
import { useAuth } from "../auth";
import { apiFetch } from "../apiClient";

type NavigationSummary = {
  workflowsNeedAttention: boolean;
  customNodesNeedAttention: boolean;
  jobsNeedAttention: boolean;
  runsNeedAttention: boolean;
  succeededRuns: number;
  awaitingPublishRuns: number;
  runnerStatus: "active" | "pausing" | "paused";
  hasActiveRuns: boolean;
};

const emptySummary: NavigationSummary = {
  workflowsNeedAttention: false,
  customNodesNeedAttention: false,
  jobsNeedAttention: false,
  runsNeedAttention: false,
  succeededRuns: 0,
  awaitingPublishRuns: 0,
  runnerStatus: "active",
  hasActiveRuns: false,
};

function AttentionIcon() {
  return <svg className="navigation-attention-icon" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 3.1v4.1m0 2.25v.05" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

function AttentionIndicator({ label }: { label: string }) {
  return <span className="navigation-attention" title={`${label} needs attention`}><AttentionIcon /></span>;
}

function RunCountIndicators({ succeeded, awaitingPublish }: { succeeded: number; awaitingPublish: number }) {
  return <span className="navigation-run-counts">
    <span className="navigation-run-count navigation-run-count-succeeded" aria-label={`${succeeded} succeeded runs`} title={`${succeeded} succeeded`}>{succeeded}</span>
    <span className="navigation-run-count navigation-run-count-awaiting" aria-label={`${awaitingPublish} awaiting publishing runs`} title={`${awaitingPublish} awaiting publishing`}>{awaitingPublish}</span>
  </span>;
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
  const [summary, setSummary] = useState<NavigationSummary>(emptySummary);

  useEffect(() => {
    if (!user) { setSummary(emptySummary); return; }
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await apiFetch("/api/navigation/summary");
        if (!response.ok) return;
        const next = await response.json() as NavigationSummary;
        if (mounted) setSummary(next);
      } catch { /* Keep the most recent navigation status if the API is temporarily unavailable. */ }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("hive:navigation-summary-refresh", refresh);
    return () => { mounted = false; window.removeEventListener("focus", refresh); window.removeEventListener("hive:navigation-summary-refresh", refresh); };
  }, [user, activeView]);

  useEffect(() => {
    if (!user || !summary.hasActiveRuns || summary.runnerStatus === "paused") return;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await apiFetch("/api/navigation/summary");
        if (response.ok) setSummary(await response.json() as NavigationSummary);
      } catch { /* Keep the last run counts if the API is temporarily unavailable. */ }
    };
    const timer = window.setInterval(() => void refresh(), 3000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [user, summary.hasActiveRuns, summary.runnerStatus]);

  const attentionRightSection = (needsAttention: boolean, label: string) => needsAttention ? <AttentionIndicator label={label} /> : undefined;
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
            <Text className="nav-caption">Studio</Text>
            <Stack gap={5} mt="sm">
            {!loading && user && <>
              <NavigationButton label="Custom Nodes" active={activeView === "custom-nodes"} icon={<AppIcon name="customNodes" />} compact={compact} rightSection={attentionRightSection(summary.customNodesNeedAttention, "Custom Nodes")} ariaLabel={`Custom Nodes${summary.customNodesNeedAttention ? ", needs attention" : ""}`} onClick={() => { onViewChange("custom-nodes"); onNavigate(); }} />
              <NavigationButton label="Workflows" active={activeView === "workflows"} icon={<AppIcon name="workflows" />} compact={compact} rightSection={attentionRightSection(summary.workflowsNeedAttention, "Workflows")} ariaLabel={`Workflows${summary.workflowsNeedAttention ? ", needs attention" : ""}`} onClick={() => { onViewChange("workflows"); onNavigate(); }} />
              <NavigationButton label="Runs" active={activeView === "runs"} icon={<AppIcon name="runs" />} compact={compact} rightSection={<RunCountIndicators succeeded={summary.succeededRuns} awaitingPublish={summary.awaitingPublishRuns} />} ariaLabel={`Runs, ${summary.succeededRuns} succeeded, ${summary.awaitingPublishRuns} awaiting publishing${summary.runsNeedAttention ? ", needs attention" : ""}`} onClick={() => { onViewChange("runs"); onNavigate(); }} />
              <NavigationButton label="Jobs" active={activeView === "jobs"} icon={<AppIcon name="jobs" />} compact={compact} rightSection={attentionRightSection(summary.jobsNeedAttention, "Jobs")} ariaLabel={`Jobs${summary.jobsNeedAttention ? ", needs attention" : ""}`} onClick={() => { onViewChange("jobs"); onNavigate(); }} />
            </>}
            </Stack>
          </Box>
          <Box mt="lg">
            <Text className="nav-caption">Resources</Text>
            <Stack gap={5} mt="sm">
              <NavigationButton label="Models" active={activeView === "models"} icon={<AppIcon name="models" />} compact={compact} onClick={() => { onViewChange("models"); onNavigate(); }} />
              {!loading && user && <>
                <NavigationButton label="Media Library" active={activeView === "media"} icon={<AppIcon name="media" />} compact={compact} onClick={() => { onViewChange("media"); onNavigate(); }} />
                <NavigationButton label="Accounts" active={activeView === "accounts"} icon={<AppIcon name="accounts" />} compact={compact} onClick={() => { onViewChange("accounts"); onNavigate(); }} />
              </>}
            </Stack>
          </Box>
          {!loading && user && <Box mt="lg">
            <Text className="nav-caption">Integrations</Text>
            <Stack gap={5} mt="sm">
              <NavigationButton label="Webhook Manager" active={activeView === "webhook-manager"} icon={<AppIcon name="webhook" />} compact={compact} onClick={() => { onViewChange("webhook-manager"); onNavigate(); }} />
            </Stack>
          </Box>}
        </Box>
      </Stack>

      <Stack gap="xs">
        <Text className="sidebar-note">Connect models and inputs in workflows, and review their runs.</Text>
        <NavigationButton label="Licenses" active={activeView === "licenses"} icon={<AppIcon name="licenses" />} compact={compact} muted onClick={() => { onViewChange("licenses"); onNavigate(); }} />
      </Stack>
    </Stack>
  );
}
