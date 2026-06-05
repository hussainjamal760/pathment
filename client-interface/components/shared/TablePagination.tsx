'use client';

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PaginationState } from '@/lib/hooks/shared/usePagination';

interface TablePaginationProps {
  pagination: PaginationState;
  /** Show the X-Y of Z label. Default true. */
  showInfo?: boolean;
  /** Show the per-page selector. Default true. */
  showPageSize?: boolean;
  /** Options for per-page selector. Default [10, 20, 50, 100]. */
  pageSizeOptions?: number[];
  isLoading?: boolean;
  className?: string;
}

/** Builds the visible page number list with ellipsis slots */
function buildPageRange(
  current: number,
  total: number
): (number | 'ellipsis-start' | 'ellipsis-end')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const items: (number | 'ellipsis-start' | 'ellipsis-end')[] = [1];

  if (current > 3) items.push('ellipsis-start');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) items.push(i);

  if (current < total - 2) items.push('ellipsis-end');

  items.push(total);
  return items;
}

export function TablePagination({
  pagination,
  showInfo = true,
  showPageSize = true,
  pageSizeOptions = [10, 20, 50, 100],
  isLoading = false,
  className,
}: TablePaginationProps) {
  const { page, limit, total, totalPages, hasNextPage, hasPrevPage, goToPage, setLimit } =
    pagination;

  if (total === 0) return null;

  const from = Math.min((page - 1) * limit + 1, total);
  const to = Math.min(page * limit, total);
  const pageNumbers = buildPageRange(page, totalPages);

  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between
                  px-1 py-2 ${className ?? ''}`}
    >
      {/* ── Left: info + page size ── */}
      <div className="flex items-center gap-4">
        {showInfo && (
          <p className="text-sm text-muted-foreground whitespace-nowrap">
            Showing{' '}
            <span className="font-medium text-foreground">{from}</span>
            {' - '}
            <span className="font-medium text-foreground">{to}</span>
            {' of '}
            <span className="font-medium text-foreground">{total}</span>
          </p>
        )}

        {showPageSize && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Rows per page
            </span>
            <Select
              value={String(limit)}
              onValueChange={(v) => setLimit(Number(v))}
              disabled={isLoading}
            >
              <SelectTrigger className="h-8 w-[70px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* ── Right: page buttons ── */}
      {totalPages > 1 && (
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (hasPrevPage && !isLoading) goToPage(page - 1);
                }}
                aria-disabled={!hasPrevPage || isLoading}
                className={
                  !hasPrevPage || isLoading
                    ? 'pointer-events-none opacity-40'
                    : ''
                }
              />
            </PaginationItem>

            {pageNumbers.map((item, idx) => {
              if (item === 'ellipsis-start' || item === 'ellipsis-end') {
                return (
                  <PaginationItem key={`${item}-${idx}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                );
              }
              return (
                <PaginationItem key={item}>
                  <PaginationLink
                    href="#"
                    isActive={item === page}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!isLoading) goToPage(item);
                    }}
                    className={isLoading ? 'pointer-events-none' : ''}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              );
            })}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (hasNextPage && !isLoading) goToPage(page + 1);
                }}
                aria-disabled={!hasNextPage || isLoading}
                className={
                  !hasNextPage || isLoading
                    ? 'pointer-events-none opacity-40'
                    : ''
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
