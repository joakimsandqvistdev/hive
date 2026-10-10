import { MantineProvider } from "@mantine/core";
import { AppLayout } from "./components/AppLayout";
import { HomePage } from "./pages/HomePage";
import { theme } from "./theme";
import { AuthProvider } from "./auth";
import { useEffect, useState } from "react";
import { AgentsPage } from "./pages/AgentsPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import { RunsPage } from "./pages/RunsPage";
import { SignInRequiredPage } from "./pages/SignInRequiredPage";
import { useAuth } from "./auth";

export type AppView = "home" | "agents" | "workflows" | "runs";

function viewFromHash(): AppView {
  const view = window.location.hash.slice(1);
  return view === "agents" || view === "workflows" || view === "runs" ? view : "home";
}

export default function App() {
  const [view, setView] = useState<AppView>(viewFromHash);

  useEffect(() => {
    const syncView = () => setView(viewFromHash());
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, []);

  const navigate = (nextView: AppView) => {
    setView(nextView);
    if (window.location.hash !== `#${nextView}`) window.location.hash = nextView;
  };

  return (
    <MantineProvider theme={theme} forceColorScheme="dark">
      <AuthProvider>
        <AppContent view={view} onNavigate={navigate} />
      </AuthProvider>
    </MantineProvider>
  );
}

function AppContent({ view, onNavigate }: { view: AppView; onNavigate: (view: AppView) => void }) {
  const { user, loading } = useAuth();
  const isProtectedView = view !== "home";
  const page = isProtectedView && loading ? <SignInRequiredPage loading />
    : isProtectedView && !user ? <SignInRequiredPage />
      : view === "agents" ? <AgentsPage />
        : view === "workflows" ? <WorkflowsPage onNavigate={onNavigate} />
          : view === "runs" ? <RunsPage onNavigate={onNavigate} />
            : <HomePage onNavigate={onNavigate} />;

  return (
    <AppLayout view={view} onNavigate={onNavigate}>
      {page}
    </AppLayout>
  );
}
