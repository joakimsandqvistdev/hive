import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { RouteBreadcrumb } from "../navigation/breadcrumbState";

export type AppBreadcrumb = RouteBreadcrumb & { onParentNavigate?: () => void };

type BreadcrumbContextValue = {
  routeKey: string;
  current: AppBreadcrumb | null;
  register: (routeKey: string, breadcrumb: AppBreadcrumb | null) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function AppBreadcrumbProvider({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const [registered, setRegistered] = useState<Record<string, AppBreadcrumb>>({});
  const register = useCallback((key: string, breadcrumb: AppBreadcrumb | null) => {
    setRegistered((current) => {
      if (breadcrumb) return { ...current, [key]: breadcrumb };
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);
  const value = useMemo(() => ({ routeKey, current: registered[routeKey] ?? null, register }), [routeKey, registered, register]);

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useCurrentAppBreadcrumb() {
  const context = useContext(BreadcrumbContext);
  if (!context) throw new Error("App breadcrumbs must be used inside AppBreadcrumbProvider.");
  return context.current;
}

export function useAppBreadcrumb(breadcrumb: AppBreadcrumb | null) {
  const context = useContext(BreadcrumbContext);
  if (!context) throw new Error("App breadcrumbs must be used inside AppBreadcrumbProvider.");
  const { routeKey, register } = context;
  const parentView = breadcrumb?.parentView;
  const currentLabel = breadcrumb?.currentLabel;
  const onParentNavigate = breadcrumb?.onParentNavigate;

  useEffect(() => {
    if (!parentView || !currentLabel) return;
    const item = { parentView, currentLabel, onParentNavigate };
    register(routeKey, item);
    return () => register(routeKey, null);
  }, [currentLabel, onParentNavigate, parentView, register, routeKey]);
}
