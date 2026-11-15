import { describe, expect, it } from "vitest";
import {
  computePagination,
  DEFAULT_PAGE_SIZE,
  getPaginationItems,
  paginateRows,
} from "@/lib/table-pagination";

describe("table-pagination", () => {
  it("returns 0–0 of 0 and a single page when empty", () => {
    expect(computePagination(0, 3, DEFAULT_PAGE_SIZE)).toEqual({
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 1,
      startIndex: 0,
      endIndex: 0,
      rangeStart: 0,
      rangeEnd: 0,
    });
  });

  it("slices rows by page and clamps oversized requested pages", () => {
    const rows = Array.from({ length: 27 }, (_, i) => `row-${i + 1}`);

    const first = paginateRows(rows, 1, 10);
    expect(first.meta.rangeStart).toBe(1);
    expect(first.meta.rangeEnd).toBe(10);
    expect(first.meta.totalPages).toBe(3);
    expect(first.pageRows).toHaveLength(10);
    expect(first.pageRows[0]).toBe("row-1");

    const clamped = paginateRows(rows, 9, 10);
    expect(clamped.meta.page).toBe(3);
    expect(clamped.meta.rangeStart).toBe(21);
    expect(clamped.meta.rangeEnd).toBe(27);
    expect(clamped.pageRows).toEqual([
      "row-21",
      "row-22",
      "row-23",
      "row-24",
      "row-25",
      "row-26",
      "row-27",
    ]);
  });

  it("builds full lists for small counts and compact ellipsis windows for larger counts", () => {
    expect(getPaginationItems(1, 1)).toEqual([1]);
    expect(getPaginationItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPaginationItems(2, 10)).toEqual([1, 2, 3, 4, "ellipsis", 10]);
    expect(getPaginationItems(5, 10)).toEqual([
      1,
      "ellipsis",
      4,
      5,
      6,
      "ellipsis",
      10,
    ]);
    expect(getPaginationItems(9, 10)).toEqual([1, "ellipsis", 7, 8, 9, 10]);
  });
});
