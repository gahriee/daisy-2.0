"use client";

import { useState } from "react";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  paginateRows,
} from "@/lib/table-pagination";

export type UseTablePaginationOptions = {
  initialPageSize?: number;
  pageSizeOptions?: readonly number[];
  resetKey?: string | number;
};

/**
 * Manages client-side page number and page size over filtered/sorted table rows
 * while resetting to page 1 on `resetKey` changes and clamping out-of-range
 * page numbers when row counts shrink.
 */
export function useTablePagination<T>(
  rows: readonly T[],
  options: UseTablePaginationOptions = {},
) {
  const pageSizeOptions = options.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(
    options.initialPageSize ?? DEFAULT_PAGE_SIZE,
  );
  const [prevResetKey, setPrevResetKey] = useState(options.resetKey);

  if (options.resetKey !== undefined && prevResetKey !== options.resetKey) {
    setPrevResetKey(options.resetKey);
    setPage(1);
  }

  const effectivePage =
    options.resetKey !== undefined && prevResetKey !== options.resetKey
      ? 1
      : page;

  const { meta, pageRows } = paginateRows(rows, effectivePage, pageSize);

  function setPageSize(nextSize: number) {
    setPageSizeState(nextSize);
    setPage(1);
  }

  return {
    paginatedRows: pageRows,
    page: meta.page,
    pageSize: meta.pageSize,
    totalItems: meta.totalItems,
    totalPages: meta.totalPages,
    rangeStart: meta.rangeStart,
    rangeEnd: meta.rangeEnd,
    setPage,
    setPageSize,
    paginationProps: {
      page: meta.page,
      pageSize: meta.pageSize,
      totalItems: meta.totalItems,
      totalPages: meta.totalPages,
      rangeStart: meta.rangeStart,
      rangeEnd: meta.rangeEnd,
      pageSizeOptions,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
    },
  };
}
