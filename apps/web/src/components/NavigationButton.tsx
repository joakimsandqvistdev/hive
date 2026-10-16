import { NavLink } from "@mantine/core";
import type { ReactNode } from "react";

type NavigationButtonProps = {
  label: string;
  active: boolean;
  icon: ReactNode;
  compact?: boolean;
  muted?: boolean;
  rightSection?: ReactNode;
  ariaLabel?: string;
  onClick: () => void;
};

export function NavigationButton({ label, active, icon, compact = false, muted = false, rightSection, ariaLabel, onClick }: NavigationButtonProps) {
  return (
    <NavLink
      component="button"
      type="button"
      label={compact ? undefined : label}
      leftSection={icon}
      rightSection={rightSection}
      active={active}
      onClick={onClick}
      className={`navigation-button${muted ? " navigation-button-muted" : ""}`}
      aria-label={ariaLabel ?? label}
      title={compact ? label : undefined}
    />
  );
}
