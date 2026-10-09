import { AppShell } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { SideNavigation } from "./SideNavigation";

export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileNavOpened, { toggle: toggleMobileNav, close: closeMobileNav }] = useDisclosure();
  const [desktopNavOpened, { toggle: toggleDesktopNav }] = useDisclosure(true);

  return (
    <AppShell
      className="hive-shell"
      layout="alt"
      padding={{ base: "md", sm: "xl" }}
      header={{ height: 76 }}
      navbar={{
        width: desktopNavOpened ? 264 : 84,
        breakpoint: "sm",
        collapsed: { mobile: !mobileNavOpened },
      }}
    >
      <AppShell.Header className="hive-header">
        <AppHeader mobileNavOpened={mobileNavOpened} onMobileNavToggle={toggleMobileNav} />
      </AppShell.Header>

      <AppShell.Navbar className="hive-navbar" p="lg">
        <SideNavigation
          compact={!desktopNavOpened}
          mobileNavOpened={mobileNavOpened}
          onMobileNavToggle={toggleMobileNav}
          onDesktopNavToggle={toggleDesktopNav}
          onNavigate={closeMobileNav}
        />
      </AppShell.Navbar>

      <AppShell.Main className="hive-main">{children}</AppShell.Main>
    </AppShell>
  );
}
