import { NavLink } from "@mantine/core";
import type { ReactNode } from "react";

type NavigationButtonProps = {
  label: string;
  active: boolean;
  icon: ReactNode;
  compact?: boolean;
  onClick: () => void;
};

export function NavigationButton({ label, active, icon, compact = false, onClick }: NavigationButtonProps) {
  return (
    <NavLink
      component="button"
      type="button"
      label={compact ? undefined : label}
      leftSection={icon}
      active={active}
      onClick={onClick}
      className="navigation-button"
      aria-label={label}
      title={compact ? label : undefined}
    />
  );
}
