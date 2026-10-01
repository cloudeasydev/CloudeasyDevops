import { Button, Select } from "@/components/ui/primitives";
import type { Pagination } from "@/lib/pagination";

export function PaginationBar({
  pagination,
  onPage,
  onPageSize,
}: {
  pagination?: Pagination;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
}) {
  if (!pagination || pagination.total === 0) return null;
  const { page, pageSize, total, totalPages } = pagination;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm text-muted">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <Select
            value={String(pageSize)}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="h-8 w-[4.5rem] py-0 text-xs"
          >
            <option value="10">10</option>
            <option value="12">12</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </Select>
        )}
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </Button>
        <span className="min-w-16 text-center text-xs">
          {page} / {totalPages}
        </span>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
