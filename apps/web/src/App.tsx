import { MantineProvider } from "@mantine/core";
import { AppLayout } from "./components/AppLayout";
import { HomePage } from "./pages/HomePage";
import { theme } from "./theme";
import { AuthProvider, useAuth } from "./auth";
import { AgentsPage } from "./pages/AgentsPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import { RunsPage } from "./pages/RunsPage";
import { SignInRequiredPage } from "./pages/SignInRequiredPage";
import { LicensesPage } from "./pages/LicensesPage";
import { useAppNavigation } from "./navigation/useAppNavigation";
import type { AppView } from "./navigation/navigationState";

export default function App() {
  const { view, sidebarCollapsed, workflowEditorActive, navigate, toggleSidebar } = useAppNavigation();

  return (
    <MantineProvider theme={theme} forceColorScheme="light">
      <AuthProvider>
        <AppContent view={view} onNavigate={navigate} sidebarCollapsed={sidebarCollapsed} workflowEditorActive={workflowEditorActive} onToggleNavigation={toggleSidebar} />
      </AuthProvider>
    </MantineProvider>
  );
}

function AppContent({ view, onNavigate, sidebarCollapsed, workflowEditorActive, onToggleNavigation }: {
  view: AppView;
  onNavigate: (view: AppView) => void;
  sidebarCollapsed: boolean;
  workflowEditorActive: boolean;
  onToggleNavigation: () => void;
}) {
  const { user, loading } = useAuth();
  const isProtectedView = view === "agents" || view === "workflows" || view === "runs";
  return (
    <AppLayout view={view} onNavigate={onNavigate} workflowEditorActive={workflowEditorActive} sidebarCollapsed={sidebarCollapsed} onToggleNavigation={onToggleNavigation}>
      {isProtectedView && loading ? <SignInRequiredPage loading />
        : isProtectedView && !user ? <SignInRequiredPage />
          : view === "agents" ? <AgentsPage />
            : view === "workflows" ? <WorkflowsPage onNavigate={onNavigate} />
              : view === "runs" ? <RunsPage onNavigate={onNavigate} />
                : view === "licenses" ? <LicensesPage />
                  : <HomePage onNavigate={onNavigate} />}
    </AppLayout>
  );
}
