import { Children, type CSSProperties, type ReactNode } from "react";
import { Table } from "@mantine/core";

export function PaginatedTableBody({ children, pageSize = 10, columnCount }: {
  children: ReactNode;
  pageSize?: number;
  columnCount: number;
}) {
  const rows = Children.toArray(children);
  const placeholders = Math.max(0, pageSize - rows.length);

  return <Table.Tbody className="paginated-table-body">
    {rows}
    {Array.from({ length: placeholders }, (_, index) => <Table.Tr className="paginated-table-placeholder-row" aria-hidden="true" key={`page-placeholder-${index}`}><Table.Td colSpan={columnCount} /></Table.Tr>)}
  </Table.Tbody>;
}

export function PaginatedListSlots({ children, pageSize = 10, minItemHeight, gap = 8, className }: {
  children: ReactNode;
  pageSize?: number;
  minItemHeight: number;
  gap?: number;
  className?: string;
}) {
  const items = Children.toArray(children);
  const placeholders = Math.max(0, pageSize - items.length);
  const style = {
    "--paginated-page-size": pageSize,
    "--paginated-item-min-height": `${minItemHeight}px`,
    "--paginated-item-gap": `${gap}px`,
  } as CSSProperties;

  return <div className={`paginated-list-slots${className ? ` ${className}` : ""}`} style={style}>
    {items}
    {Array.from({ length: placeholders }, (_, index) => <div className="paginated-list-slot-placeholder" aria-hidden="true" key={`page-placeholder-${index}`} />)}
  </div>;
}
