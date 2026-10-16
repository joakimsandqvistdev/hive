import type { ReactNode } from "react";
import { Button, Group, Modal, Stack, type ModalProps, type StackProps } from "@mantine/core";

export function ConfirmActionModal({ opened, onClose, title, children, confirmLabel, onConfirm, loading = false, disabled = false, color = "hiveError", modalClassName, size, stackGap = "md" }: {
  opened: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
  color?: string;
  modalClassName?: string;
  size?: ModalProps["size"];
  stackGap?: StackProps["gap"];
}) {
  return <Modal opened={opened} onClose={onClose} title={title} centered size={size} classNames={modalClassName ? { content: modalClassName } : undefined}>
    <Stack gap={stackGap}>{children}<Group justify="flex-end">
      <Button variant="default" onClick={onClose}>Cancel</Button>
      <Button color={color} loading={loading} disabled={disabled} onClick={onConfirm}>{confirmLabel}</Button>
    </Group></Stack>
  </Modal>;
}
