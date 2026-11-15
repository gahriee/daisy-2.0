"use client";

import { useState } from "react";
import {
  sortRows,
  toggleSortState,
  type SortColumnDef,
  type SortDirection,
  type SortState,
} from "@/lib/table-sort";

/**
 * Manages client-side single-column sorting state for tabular data views while
 * keeping empty values last and preserving original tie order.
 */
export function useTableSort<T, K extends string>(
  rows: readonly T[],
  columns: Record<K, SortColumnDef<T>>,
  initialSort: SortState<NoInfer<K>> | null = null,
) {
  const [sort, setSort] = useState<SortState<K> | null>(initialSort);

  const sortedRows = sortRows(rows, sort, columns);

  function toggleSort(key: K) {
    const defaultDirection = columns[key]?.defaultDirection ?? "asc";
    setSort((prev) => toggleSortState(prev, key, defaultDirection));
  }

  function getSortDirection(key: K): SortDirection | null {
    return sort?.key === key ? sort.direction : null;
  }

  function sortHeaderProps(key: K): {
    sortDirection: SortDirection | null;
    onSort: () => void;
  } {
    return {
      sortDirection: getSortDirection(key),
      onSort: () => toggleSort(key),
    };
  }

  return {
    sort,
    setSort,
    sortedRows,
    toggleSort,
    getSortDirection,
    sortHeaderProps,
  };
}
