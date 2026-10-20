import { Burger, Group, Text, UnstyledButton } from "@mantine/core";
import { AuthControl } from "./AuthControl";
import { useCurrentAppBreadcrumb } from "./AppBreadcrumbs";
import { nestedRouteBreadcrumb } from "../navigation/breadcrumbState";
import type { AppView } from "../navigation/navigationState";

const viewTitles: Record<AppView, string> = {
  home: "Home",
  workflows: "Workflows",
  "custom-nodes": "Custom Nodes",
  jobs: "Jobs",
  runs: "Runs",
  publish: "Publish",
  models: "Models",
  accounts: "Accounts",
  media: "Media Library",
  "webhook-manager": "Webhook Manager",
  licenses: "Open-source licenses",
};

export function AppHeader({
  view,
  mobileNavOpened,
  onMobileNavToggle,
  onNavigate,
}: {
  view: AppView;
  mobileNavOpened: boolean;
  onMobileNavToggle: () => void;
  onNavigate: (view: AppView) => void;
}) {
  const registeredBreadcrumb = useCurrentAppBreadcrumb();
  const breadcrumb = registeredBreadcrumb ?? nestedRouteBreadcrumb(view, window.location.hash);
  const currentTitle = breadcrumb?.currentLabel ?? viewTitles[view];
  const parentTitle = breadcrumb ? viewTitles[breadcrumb.parentView] : null;
  const navigateToParent = () => {
    if (registeredBreadcrumb?.onParentNavigate) registeredBreadcrumb.onParentNavigate();
    else if (breadcrumb) onNavigate(breadcrumb.parentView);
  };

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
        <nav className="app-breadcrumb-nav" aria-label="Breadcrumb">
          <Group className="app-breadcrumbs" gap={6} wrap="nowrap">
            {breadcrumb && parentTitle && <>
              <UnstyledButton className="app-breadcrumb-parent" onClick={navigateToParent}>{parentTitle}</UnstyledButton>
              <Text className="app-breadcrumb-separator" aria-hidden="true">/</Text>
            </>}
            <Text className={breadcrumb && parentTitle ? "app-breadcrumb-current" : "header-context"} fw={breadcrumb && parentTitle ? 600 : undefined} truncate aria-current="page">{currentTitle}</Text>
          </Group>
        </nav>
      </Group>
      <AuthControl />
    </Group>
  );
}
