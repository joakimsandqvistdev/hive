import { useCallback, useEffect, useRef, useState } from "react";
import {
  createNavigationState,
  transitionNavigationHash,
  toggleNavigationSidebar,
  type AppView,
  type NavigationState,
} from "./navigationState";

const SIDEBAR_COLLAPSED_KEY = "hive.sidebarCollapsed";
const SIDEBAR_BEFORE_EDITOR_KEY = "hive.sidebarBeforeWorkflowEditor";

function readBoolean(value: string | null): boolean | null {
  return value === null ? null : value === "true";
}

function initialState(): NavigationState {
  const preferred = readBoolean(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)) ?? false;
  const remembered = readBoolean(window.localStorage.getItem(SIDEBAR_BEFORE_EDITOR_KEY));
  return createNavigationState(window.location.hash, preferred, remembered);
}

function persistState(state: NavigationState) {
  window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(state.sidebarCollapsed));
  if (state.workflowEditorActive && state.sidebarBeforeEditor !== null) {
    window.localStorage.setItem(SIDEBAR_BEFORE_EDITOR_KEY, String(state.sidebarBeforeEditor));
  } else {
    window.localStorage.removeItem(SIDEBAR_BEFORE_EDITOR_KEY);
  }
}

export function useAppNavigation() {
  const [state, setState] = useState<NavigationState>(initialState);
  const stateRef = useRef(state);

  const applyState = useCallback((next: NavigationState) => {
    stateRef.current = next;
    setState(next);
    persistState(next);
  }, []);

  useEffect(() => {
    persistState(stateRef.current);
    const syncHash = () => applyState(transitionNavigationHash(stateRef.current, window.location.hash));
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [applyState]);

  const navigate = useCallback((nextView: AppView) => {
    applyState(transitionNavigationHash(stateRef.current, `#${nextView}`));
    if (window.location.hash !== `#${nextView}`) window.location.hash = nextView;
  }, [applyState]);

  const toggleSidebar = useCallback(() => {
    applyState(toggleNavigationSidebar(stateRef.current));
  }, [applyState]);

  return { ...state, navigate, toggleSidebar };
}
