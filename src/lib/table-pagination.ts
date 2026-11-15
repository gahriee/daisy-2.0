export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export type PaginationMeta = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  rangeStart: number;
  rangeEnd: number;
};

export type PaginationItem = number | "ellipsis";

/**
 * Computes bounded 1-based page metadata and 0-based slice bounds for tabular
 * views, returning `0–0 of 0` range bounds when no rows are present.
 */
export function computePagination(
  totalItems: number,
  requestedPage: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): PaginationMeta {
  const safeTotal =
    Number.isFinite(totalItems) && totalItems > 0 ? Math.floor(totalItems) : 0;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize >= 1
      ? Math.floor(pageSize)
      : DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const rawPage =
    Number.isFinite(requestedPage) && requestedPage >= 1
      ? Math.floor(requestedPage)
      : 1;
  const page = Math.min(rawPage, totalPages);

  if (safeTotal === 0) {
    return {
      page: 1,
      pageSize: safePageSize,
      totalItems: 0,
      totalPages: 1,
      startIndex: 0,
      endIndex: 0,
      rangeStart: 0,
      rangeEnd: 0,
    };
  }

  const startIndex = (page - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, safeTotal);

  return {
    page,
    pageSize: safePageSize,
    totalItems: safeTotal,
    totalPages,
    startIndex,
    endIndex,
    rangeStart: startIndex + 1,
    rangeEnd: endIndex,
  };
}

/**
 * Slices a sorted array of rows to the requested page while returning resolved
 * pagination bounds.
 */
export function paginateRows<T>(
  rows: readonly T[],
  requestedPage: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): { meta: PaginationMeta; pageRows: T[] } {
  const meta = computePagination(rows.length, requestedPage, pageSize);
  return {
    meta,
    pageRows: rows.slice(meta.startIndex, meta.endIndex),
  };
}

/**
 * Builds compact page number and ellipsis items so wide page counts never
 * overflow pagination toolbars.
 */
export function getPaginationItems(
  currentPage: number,
  totalPages: number,
): PaginationItem[] {
  const safeTotal =
    Number.isFinite(totalPages) && totalPages >= 1 ? Math.floor(totalPages) : 1;
  const safeCurrent = Math.min(
    Math.max(1, Number.isFinite(currentPage) ? Math.floor(currentPage) : 1),
    safeTotal,
  );

  if (safeTotal <= 7) {
    return Array.from({ length: safeTotal }, (_, i) => i + 1);
  }

  if (safeCurrent <= 3) {
    return [1, 2, 3, 4, "ellipsis", safeTotal];
  }

  if (safeCurrent >= safeTotal - 2) {
    return [
      1,
      "ellipsis",
      safeTotal - 3,
      safeTotal - 2,
      safeTotal - 1,
      safeTotal,
    ];
  }

  return [
    1,
    "ellipsis",
    safeCurrent - 1,
    safeCurrent,
    safeCurrent + 1,
    "ellipsis",
    safeTotal,
  ];
}
