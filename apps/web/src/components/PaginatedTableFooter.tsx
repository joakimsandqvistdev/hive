import { Group, Pagination, Text } from "@mantine/core";

export function PaginatedTableFooter({ total, itemName, page, totalPages, onPageChange }: {
  total: number;
  itemName: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const label = total === 1 ? itemName : `${itemName}s`;
  return <Group justify="space-between" px="md" py="sm" className="workspace-table-footer">
    <Text size="sm" c="dimmed">{total} {label}</Text>
    <Pagination value={page} onChange={onPageChange} total={totalPages} size="sm" withEdges />
  </Group>;
}
