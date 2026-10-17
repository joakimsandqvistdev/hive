import type { ReactNode } from "react";
import { ActionIcon, Group, Tooltip, type TooltipProps } from "@mantine/core";

export function WorkspaceTableActions({ children, className }: { children: ReactNode; className?: string }) {
  return <Group className={className} gap={4} wrap="nowrap" justify="flex-end" w="100%">{children}</Group>;
}

export function WorkspaceTableAction({
  label,
  tooltip,
  tooltipProps,
  color = "hiveSky",
  disabled = false,
  loading = false,
  onClick,
  children,
}: {
  label: string;
  tooltip?: ReactNode;
  tooltipProps?: Partial<Omit<TooltipProps, "label" | "children">>;
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return <Tooltip label={tooltip ?? label} {...tooltipProps}>
    <span>
      <ActionIcon variant="subtle" color={color} aria-label={label} disabled={disabled} loading={loading} onClick={onClick}>
        {children}
      </ActionIcon>
    </span>
  </Tooltip>;
}

export function WorkspaceTableInfo({ label, tooltip, tooltipProps, children }: {
  label: string;
  tooltip: ReactNode;
  tooltipProps?: Partial<Omit<TooltipProps, "label" | "children">>;
  children: ReactNode;
}) {
  return <Tooltip label={tooltip} {...tooltipProps}>
    <ActionIcon component="span" variant="subtle" color="hiveSky" role="img" tabIndex={0} aria-label={label}>
      {children}
    </ActionIcon>
  </Tooltip>;
}

export function EditIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.12 2.12 0 0 0-3-3L5.2 16.2 4 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function PlayIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" /></svg>;
}

export function PauseIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
}

export function ActivityIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" /><path d="M12 7v5l3.2 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function DuplicateIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

export function CopyIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

export function TrashIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 12.2a1 1 0 0 1-1 .8H7.8a1 1 0 0 1-1-.8L6 7m4 4v5m4-5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function WebhookIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.7"/><circle cx="18" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.7"/><circle cx="18" cy="18" r="2.4" stroke="currentColor" strokeWidth="1.7"/><path d="m8.2 10.8 7.5-3.7M8.3 13.2l7.4 3.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}
