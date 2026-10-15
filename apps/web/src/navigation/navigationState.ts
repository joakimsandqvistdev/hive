export type AppView = "home" | "workflows" | "jobs" | "runs" | "models" | "licenses";

export type NavigationState = {
  view: AppView;
  sidebarCollapsed: boolean;
  workflowEditorActive: boolean;
  sidebarBeforeEditor: boolean | null;
};

export function appViewFromHash(hash: string): AppView {
  const view = hash.replace(/^#/, "").split("/")[0];
  return view === "workflows" || view === "jobs" || view === "runs" || view === "models" || view === "licenses" ? view : "home";
}

export function isWorkflowEditorHash(hash: string): boolean {
  return /^#workflows\/[^/]+$/.test(hash);
}

export function createNavigationState(hash: string, preferredSidebarCollapsed: boolean, rememberedSidebar: boolean | null = null): NavigationState {
  const workflowEditorActive = isWorkflowEditorHash(hash);
  return {
    view: appViewFromHash(hash),
    sidebarCollapsed: workflowEditorActive || preferredSidebarCollapsed,
    workflowEditorActive,
    sidebarBeforeEditor: workflowEditorActive ? rememberedSidebar ?? preferredSidebarCollapsed : null,
  };
}

export function transitionNavigationHash(state: NavigationState, hash: string): NavigationState {
  const workflowEditorActive = isWorkflowEditorHash(hash);
  if (workflowEditorActive === state.workflowEditorActive) {
    return { ...state, view: appViewFromHash(hash) };
  }

  if (workflowEditorActive) {
    return {
      view: appViewFromHash(hash),
      sidebarCollapsed: true,
      workflowEditorActive: true,
      sidebarBeforeEditor: state.sidebarCollapsed,
    };
  }

  return {
    view: appViewFromHash(hash),
    sidebarCollapsed: state.sidebarBeforeEditor ?? state.sidebarCollapsed,
    workflowEditorActive: false,
    sidebarBeforeEditor: null,
  };
}

export function toggleNavigationSidebar(state: NavigationState): NavigationState {
  const sidebarCollapsed = !state.sidebarCollapsed;
  return {
    ...state,
    sidebarCollapsed,
    sidebarBeforeEditor: state.workflowEditorActive ? sidebarCollapsed : state.sidebarBeforeEditor,
  };
}
