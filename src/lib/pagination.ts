import { useState } from "react";

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type Paginated<T> = {
  items: T[];
  pagination: Pagination;
};

export function usePager(initialSize = 12) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);

  return {
    page,
    pageSize,
    setPage,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
    reset: () => setPage(1),
    query: `page=${page}&pageSize=${pageSize}`,
  };
}

export function paginateLocal<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: { page: safePage, pageSize, total, totalPages },
  };
}
