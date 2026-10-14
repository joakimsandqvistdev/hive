import type { ReactNode } from "react";
import { Button, Group, Modal, Stack } from "@mantine/core";

export function ConfirmActionModal({ opened, onClose, title, children, confirmLabel, onConfirm, loading = false, disabled = false, color = "hiveError" }: {
  opened: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
  color?: string;
}) {
  return <Modal opened={opened} onClose={onClose} title={title} centered>
    <Stack gap="md">{children}<Group justify="flex-end">
      <Button variant="default" onClick={onClose}>Cancel</Button>
      <Button color={color} loading={loading} disabled={disabled} onClick={onConfirm}>{confirmLabel}</Button>
    </Group></Stack>
  </Modal>;
}
