import type { SVGProps } from "react";

export type AppIconName = "home" | "accounts" | "media" | "models" | "workflows" | "customNodes" | "jobs" | "runs" | "licenses" | "publish";

const paths: Record<AppIconName, React.ReactNode> = {
  home: <><path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9.5v10a1 1 0 0 0 1 1h4v-6h3v6h3a1 1 0 0 0 1-1v-10"/></>,
  accounts: <><circle cx="9" cy="8" r="3.25"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M15 5.2a3.25 3.25 0 0 1 0 5.6M17 14a5.1 5.1 0 0 1 3.5 4.8"/></>,
  media: <><rect x="3.5" y="4" width="17" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.5"/><path d="m5 17 4.2-4 3.1 2.7 2.3-2 4.4 3.3"/></>,
  models: <><path d="m12 3.5 8 4.25v8.5l-8 4.25-8-4.25v-8.5L12 3.5Z"/><path d="m4.4 7.9 7.6 4.2 7.6-4.2M12 12.1v8.1"/></>,
  workflows: <><rect x="3.5" y="4" width="6" height="6" rx="1.5"/><rect x="14.5" y="14" width="6" height="6" rx="1.5"/><path d="M9.5 7h3a2 2 0 0 1 2 2v5M14.5 17h-3a2 2 0 0 1-2-2v-5"/></>,
  customNodes: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/></>,
  jobs: <><rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16"/><circle cx="12" cy="15" r="3"/><path d="M12 13.5V15l1.2.8"/></>,
  runs: <><path d="M4 6h3M4 12h3M4 18h3M11 6h9M11 12h9M11 18h9"/><circle cx="5.5" cy="6" r=".5"/><circle cx="5.5" cy="12" r=".5"/><circle cx="5.5" cy="18" r=".5"/></>,
  licenses: <><path d="M6.5 3.5h7l4 4v13h-11v-17Z"/><path d="M13.5 3.8v4h4M9 12h6M9 15.5h6"/></>,
  publish: <><path d="M12 15.5V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 13.5v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></>,
};

export function AppIcon({ name, size = 19, ...props }: { name: AppIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
