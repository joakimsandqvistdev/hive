import { Group, Pagination, Text } from "@mantine/core";

export function PaginatedTableFooter({ total, itemName, page, pageSize = 10, totalPages, onPageChange }: {
  total: number;
  itemName: string;
  page: number;
  pageSize?: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const label = total === 1 ? itemName : `${itemName}s`;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return <Group justify="space-between" px="md" py="sm" className="workspace-table-footer">
    <Text size="sm" c="dimmed">{first}-{last} of {total} {label}</Text>
    <Pagination value={page} onChange={onPageChange} total={totalPages} size="sm" withEdges />
  </Group>;
}
