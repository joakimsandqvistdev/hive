import type { Request } from "express";

export type Pagination = { page: number; pageSize: number; offset: number };

export function parsePagination(req: Pick<Request, "query">): Pagination {
  const page = Math.min(1_000_000, Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1));
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "10"), 10) || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function totalPages(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize);
}
