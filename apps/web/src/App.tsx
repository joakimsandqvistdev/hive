import { MantineProvider } from "@mantine/core";
import { AppLayout } from "./components/AppLayout";
import { HomePage } from "./pages/HomePage";
import { theme } from "./theme";
import { AuthProvider, useAuth } from "./auth";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import { RunsPage } from "./pages/RunsPage";
import { SignInRequiredPage } from "./pages/SignInRequiredPage";
import { LicensesPage } from "./pages/LicensesPage";
import { ModelsPage } from "./pages/ModelsPage";
import { JobsPage } from "./pages/JobsPage";
import { AccountsPage } from "./pages/AccountsPage";
import { MediaLibraryPage } from "./pages/MediaLibraryPage";
import { CustomNodesPage } from "./pages/CustomNodesPage";
import { WebhookManagerPage } from "./pages/WebhookManagerPage";
import { PublishPage } from "./pages/PublishPage";
import { useAppNavigation } from "./navigation/useAppNavigation";
import type { AppView } from "./navigation/navigationState";
import { FlashMessagesProvider } from "./components/FlashMessages";

export default function App() {
  const { view, sidebarCollapsed, workflowEditorActive, navigate, toggleSidebar } = useAppNavigation();

  return (
    <MantineProvider theme={theme} forceColorScheme="light">
      <AuthProvider>
        <FlashMessagesProvider>
          <AppContent view={view} onNavigate={navigate} sidebarCollapsed={sidebarCollapsed} workflowEditorActive={workflowEditorActive} onToggleNavigation={toggleSidebar} />
        </FlashMessagesProvider>
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
  const isProtectedView = view === "workflows" || view === "custom-nodes" || view === "jobs" || view === "runs" || view === "publish" || view === "models" || view === "accounts" || view === "media" || view === "webhook-manager";
  return (
    <AppLayout view={view} onNavigate={onNavigate} workflowEditorActive={workflowEditorActive} sidebarCollapsed={sidebarCollapsed} onToggleNavigation={onToggleNavigation}>
      {isProtectedView && loading ? <SignInRequiredPage loading />
        : isProtectedView && !user ? <SignInRequiredPage />
            : view === "workflows" ? <WorkflowsPage onNavigate={onNavigate} />
              : view === "custom-nodes" ? <CustomNodesPage onNavigate={onNavigate} />
              : view === "runs" ? <RunsPage onNavigate={onNavigate} />
              : view === "publish" ? <PublishPage onNavigate={onNavigate} />
                : view === "jobs" ? <JobsPage onNavigate={onNavigate} />
                : view === "models" ? <ModelsPage />
                : view === "accounts" ? <AccountsPage />
                : view === "media" ? <MediaLibraryPage />
                : view === "webhook-manager" ? <WebhookManagerPage onNavigate={onNavigate} />
                : view === "licenses" ? <LicensesPage />
                  : <HomePage onNavigate={onNavigate} />}
    </AppLayout>
  );
}
