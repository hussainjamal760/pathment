'use client';

import { ReactNode, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/components/ui/utils';
import { TableSkeleton } from './TableSkeleton';
import { EmptyState, EmptyStateProps } from './EmptyState';
import { ErrorState } from './ErrorState';

// Extend the base TableColumn from common.ts with extra display options
export interface DataTableColumn<T> {
  /** Key of the row object, or a unique string for render-only columns */
  key: keyof T | string;
  /** Column header label */
  label: string;
  /** Enable client-side sort on this column */
  sortable?: boolean;
  /** Custom renderer - receives (value, row) */
  render?: (value: any, row: T) => ReactNode;
  /** Extra classes for the <th> */
  headerClassName?: string;
  /** Extra classes for each <td> */
  cellClassName?: string;
  /** text-left (default) | text-center | text-right */
  align?: 'left' | 'center' | 'right';
}

type SortDirection = 'asc' | 'desc';

interface SortState {
  key: string;
  direction: SortDirection;
}

export interface DataTableProps<T extends Record<string, any>> {
  /** Column definitions */
  columns: DataTableColumn<T>[];
  /** Row data */
  data: T[];
  /** Unique key for each row - used for selection tracking */
  rowKey?: keyof T;
  /** Show loading skeleton */
  isLoading?: boolean;
  /** Show error state */
  error?: string | null;
  /** Retry callback shown in error state */
  onRetry?: () => void;
  /** Empty state config */
  emptyState?: EmptyStateProps;
  /** Enable row selection with checkboxes */
  selectable?: boolean;
  /** Currently selected row keys */
  selectedKeys?: string[];
  /** Fires when selection changes */
  onSelectionChange?: (keys: string[]) => void;
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** Extra classes on the wrapping div */
  className?: string;
  /** Extra classes on the <table> */
  tableClassName?: string;
  /** Number of skeleton rows while loading */
  skeletonRows?: number;
}

function SortIcon({
  columnKey,
  sort,
}: {
  columnKey: string;
  sort: SortState | null;
}) {
  if (sort?.key !== columnKey)
    return <ArrowUpDown className="ml-1.5 inline-block h-3.5 w-3.5 opacity-40" />;
  return sort.direction === 'asc' ? (
    <ArrowUp className="ml-1.5 inline-block h-3.5 w-3.5 text-primary" />
  ) : (
    <ArrowDown className="ml-1.5 inline-block h-3.5 w-3.5 text-primary" />
  );
}

function sortData<T extends Record<string, any>>(
  data: T[],
  sort: SortState | null
): T[] {
  if (!sort) return data;
  return [...data].sort((a, b) => {
    const aVal = a[sort.key];
    const bVal = b[sort.key];
    if (aVal === bVal) return 0;
    const gt = aVal > bVal ? 1 : -1;
    return sort.direction === 'asc' ? gt : -gt;
  });
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  rowKey = 'id' as keyof T,
  isLoading = false,
  error = null,
  onRetry,
  emptyState,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  onRowClick,
  className,
  tableClassName,
  skeletonRows = 8,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null);

  // ── Sort ────────────────────────────────────────────────────────
  const handleSort = (colKey: string) => {
    setSort((prev) => {
      if (prev?.key !== colKey) return { key: colKey, direction: 'asc' };
      if (prev.direction === 'asc') return { key: colKey, direction: 'desc' };
      return null; // third click clears sort
    });
  };

  // ── Selection ───────────────────────────────────────────────────
  const allKeys = data.map((row) => String(row[rowKey]));
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.includes(k));
  const someSelected = allKeys.some((k) => selectedKeys.includes(k));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? [] : allKeys);
  };

  const toggleRow = (key: string) => {
    if (!onSelectionChange) return;
    onSelectionChange(
      selectedKeys.includes(key)
        ? selectedKeys.filter((k) => k !== key)
        : [...selectedKeys, key]
    );
  };

  // ── Render guards ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={className}>
        <TableSkeleton
          rows={skeletonRows}
          cols={selectable ? columns.length + 1 : columns.length}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={className}>
        <EmptyState
          title={emptyState?.title ?? 'No results found'}
          description={emptyState?.description}
          icon={emptyState?.icon}
          action={emptyState?.action}
        />
      </div>
    );
  }

  const sortedData = sortData(data, sort);

  const alignClass = (align?: 'left' | 'center' | 'right') => {
    if (align === 'center') return 'text-center';
    if (align === 'right') return 'text-right';
    return 'text-left';
  };

  return (
    <div className={cn('w-full overflow-hidden rounded-xl border border-border', className)}>
      <Table className={tableClassName}>
        {/* ── Header ── */}
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {selectable && (
              <TableHead className="w-10 px-4">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) (el as any).indeterminate = someSelected && !allSelected;
                  }}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
            )}

            {columns.map((col) => (
              <TableHead
                key={String(col.key)}
                className={cn(
                  alignClass(col.align),
                  col.sortable && 'cursor-pointer select-none hover:text-foreground',
                  col.headerClassName
                )}
                onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
              >
                <span className="inline-flex items-center">
                  {col.label}
                  {col.sortable && (
                    <SortIcon columnKey={String(col.key)} sort={sort} />
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        {/* ── Body ── */}
        <TableBody>
          {sortedData.map((row) => {
            const key = String(row[rowKey]);
            const isSelected = selectedKeys.includes(key);

            return (
              <TableRow
                key={key}
                data-state={isSelected ? 'selected' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  onRowClick && 'cursor-pointer',
                  isSelected && 'bg-accent/50'
                )}
              >
                {selectable && (
                  <TableCell className="w-10 px-4">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleRow(key)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select row ${key}`}
                    />
                  </TableCell>
                )}

                {columns.map((col) => {
                  const rawValue = row[col.key as string];
                  return (
                    <TableCell
                      key={String(col.key)}
                      className={cn(alignClass(col.align), col.cellClassName)}
                    >
                      {col.render ? col.render(rawValue, row) : (rawValue ?? '-')}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
