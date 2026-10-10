import { MantineProvider } from "@mantine/core";
import { AppLayout } from "./components/AppLayout";
import { HomePage } from "./pages/HomePage";
import { theme } from "./theme";
import { AuthProvider } from "./auth";
import { useCallback, useEffect, useState } from "react";
import { useRef } from "react";
import { AgentsPage } from "./pages/AgentsPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import { RunsPage } from "./pages/RunsPage";
import { SignInRequiredPage } from "./pages/SignInRequiredPage";
import { useAuth } from "./auth";
import { LicensesPage } from "./pages/LicensesPage";

export type AppView = "home" | "agents" | "workflows" | "runs" | "licenses";

function viewFromHash(): AppView {
  const view = window.location.hash.slice(1).split("/")[0];
  return view === "agents" || view === "workflows" || view === "runs" || view === "licenses" ? view : "home";
}

export default function App() {
  const [view, setView] = useState<AppView>(viewFromHash);
  const initialEditorRoute = /^#workflows\/[^/]+$/.test(window.location.hash);
  const initialSidebarCollapsed = initialEditorRoute || window.localStorage.getItem("hive.sidebarCollapsed") === "true";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed);
  const sidebarCollapsedRef = useRef(initialSidebarCollapsed);
  const workflowEditorActiveRef = useRef(initialEditorRoute);

  const toggleNavigation = useCallback(() => {
    const collapsed = !sidebarCollapsedRef.current;
    sidebarCollapsedRef.current = collapsed;
    setSidebarCollapsed(collapsed);
    if (workflowEditorActiveRef.current) {
      window.localStorage.setItem("hive.sidebarBeforeWorkflowEditor", collapsed ? "true" : "false");
    } else {
      window.localStorage.setItem("hive.sidebarCollapsed", collapsed ? "true" : "false");
    }
  }, []);

  useEffect(() => {
    if (workflowEditorActiveRef.current && window.localStorage.getItem("hive.sidebarBeforeWorkflowEditor") === null) {
      window.localStorage.setItem("hive.sidebarBeforeWorkflowEditor", window.localStorage.getItem("hive.sidebarCollapsed") ?? "false");
      window.localStorage.setItem("hive.sidebarCollapsed", "true");
    }
    const syncView = () => {
      setView(viewFromHash());
      const enteringEditor = /^#workflows\/[^/]+$/.test(window.location.hash);
      if (enteringEditor && !workflowEditorActiveRef.current) {
        window.localStorage.setItem("hive.sidebarBeforeWorkflowEditor", String(sidebarCollapsedRef.current));
        sidebarCollapsedRef.current = true;
        setSidebarCollapsed(true);
        window.localStorage.setItem("hive.sidebarCollapsed", "true");
      } else if (!enteringEditor && workflowEditorActiveRef.current) {
        const savedState = window.localStorage.getItem("hive.sidebarBeforeWorkflowEditor");
        if (savedState !== null) {
          const restoredCollapsed = savedState === "true";
          sidebarCollapsedRef.current = restoredCollapsed;
          setSidebarCollapsed(restoredCollapsed);
          window.localStorage.setItem("hive.sidebarCollapsed", String(restoredCollapsed));
        }
        window.localStorage.removeItem("hive.sidebarBeforeWorkflowEditor");
      }
      workflowEditorActiveRef.current = enteringEditor;
    };
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
        <AppContent view={view} onNavigate={navigate} sidebarCollapsed={sidebarCollapsed} onToggleNavigation={toggleNavigation} />
      </AuthProvider>
    </MantineProvider>
  );
}

function AppContent({ view, onNavigate, sidebarCollapsed, onToggleNavigation }: {
  view: AppView;
  onNavigate: (view: AppView) => void;
  sidebarCollapsed: boolean;
  onToggleNavigation: () => void;
}) {
  const { user, loading } = useAuth();
  const [workflowEditorActive, setWorkflowEditorActive] = useState(() => /^#workflows\/[^/]+$/.test(window.location.hash));
  const isProtectedView = view === "agents" || view === "workflows" || view === "runs";
  return (
    <AppLayout view={view} onNavigate={onNavigate} workflowEditorActive={workflowEditorActive} sidebarCollapsed={sidebarCollapsed} onToggleNavigation={onToggleNavigation}>
      {isProtectedView && loading ? <SignInRequiredPage loading />
        : isProtectedView && !user ? <SignInRequiredPage />
          : view === "agents" ? <AgentsPage />
            : view === "workflows" ? <WorkflowsPage onNavigate={onNavigate} onEditorModeChange={setWorkflowEditorActive} />
              : view === "runs" ? <RunsPage onNavigate={onNavigate} />
                : view === "licenses" ? <LicensesPage />
                  : <HomePage onNavigate={onNavigate} />}
    </AppLayout>
  );
}
