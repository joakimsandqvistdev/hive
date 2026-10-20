export type AppView = "home" | "workflows" | "custom-nodes" | "jobs" | "runs" | "models" | "accounts" | "media" | "webhook-manager" | "licenses";

export type NavigationState = {
  view: AppView;
  sidebarCollapsed: boolean;
  workflowEditorActive: boolean;
};

export function appViewFromHash(hash: string): AppView {
  const view = hash.replace(/^#/, "").split("/")[0];
  const normalized = view?.split("?")[0];
  return normalized === "workflows" || normalized === "custom-nodes" || normalized === "jobs" || normalized === "runs" || normalized === "models" || normalized === "accounts" || normalized === "media" || normalized === "webhook-manager" || normalized === "licenses" ? normalized : "home";
}

export function isWorkflowEditorHash(hash: string): boolean {
  return /^#(?:workflows|custom-nodes)\/[^/]+$/.test(hash);
}

export function createNavigationState(hash: string, preferredSidebarCollapsed: boolean): NavigationState {
  const workflowEditorActive = isWorkflowEditorHash(hash);
  return {
    view: appViewFromHash(hash),
    sidebarCollapsed: preferredSidebarCollapsed,
    workflowEditorActive,
  };
}

export function transitionNavigationHash(state: NavigationState, hash: string): NavigationState {
  return {
    view: appViewFromHash(hash),
    sidebarCollapsed: state.sidebarCollapsed,
    workflowEditorActive: isWorkflowEditorHash(hash),
  };
}

export function toggleNavigationSidebar(state: NavigationState): NavigationState {
  return {
    ...state,
    sidebarCollapsed: !state.sidebarCollapsed,
  };
}
