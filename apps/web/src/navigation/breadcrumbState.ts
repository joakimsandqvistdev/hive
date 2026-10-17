import type { AppView } from "./navigationState";

export type RouteBreadcrumb = { parentView: AppView; currentLabel: string };

const nestedPageFallbacks: Partial<Record<AppView, string>> = {
  workflows: "Workflow",
  "custom-nodes": "Custom node",
  runs: "Run details",
};

export function nestedRouteBreadcrumb(view: AppView, hash: string): RouteBreadcrumb | null {
  const [route, id] = hash.replace(/^#/, "").split("?")[0].split("/");
  if (route !== view || !id) return null;
  return { parentView: view, currentLabel: nestedPageFallbacks[view] ?? "Details" };
}
