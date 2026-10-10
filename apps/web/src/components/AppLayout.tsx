import { AppShell } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { SideNavigation } from "./SideNavigation";
import type { AppView } from "../navigation/navigationState";

export function AppLayout({ children, view, onNavigate, workflowEditorActive, sidebarCollapsed, onToggleNavigation }: {
  children: ReactNode;
  view: AppView;
  onNavigate: (view: AppView) => void;
  workflowEditorActive: boolean;
  sidebarCollapsed: boolean;
  onToggleNavigation: () => void;
}) {
  const [mobileNavOpened, { toggle: toggleMobileNav, close: closeMobileNav }] = useDisclosure();

  return (
    <AppShell
      className="hive-shell"
      layout="alt"
      padding={workflowEditorActive ? 0 : { base: "md", sm: "lg" }}
      header={{ height: 64 }}
      navbar={{
        width: sidebarCollapsed ? 72 : 244,
        breakpoint: "sm",
        collapsed: { mobile: !mobileNavOpened },
      }}
    >
      <AppShell.Header className="hive-header">
        <AppHeader mobileNavOpened={mobileNavOpened} onMobileNavToggle={toggleMobileNav} />
      </AppShell.Header>
      <AppShell.Navbar className="hive-navbar" p="md">
        <SideNavigation
          compact={sidebarCollapsed}
          mobileNavOpened={mobileNavOpened}
          onMobileNavToggle={toggleMobileNav}
          onDesktopNavToggle={onToggleNavigation}
          onNavigate={closeMobileNav}
          activeView={view}
          onViewChange={onNavigate}
        />
      </AppShell.Navbar>
      <AppShell.Main className={workflowEditorActive ? "hive-main workflow-editor-main" : "hive-main"}>{children}</AppShell.Main>
    </AppShell>
  );
}
