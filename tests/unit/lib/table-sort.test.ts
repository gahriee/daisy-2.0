import { describe, expect, it } from "vitest";
import {
  sortRows,
  toggleSortState,
  type SortColumnDef,
  type SortState,
} from "@/lib/table-sort";

type SampleRow = {
  id: string;
  label: string;
  roomNumber: string | null;
  amount: string | null;
  dueDate: string | null;
  seq: number | null;
};

type SampleKey = "label" | "roomNumber" | "amount" | "dueDate" | "seq";

const COLUMNS: Record<SampleKey, SortColumnDef<SampleRow>> = {
  label: { getValue: (row) => row.label },
  roomNumber: { getValue: (row) => row.roomNumber },
  amount: {
    getValue: (row) => row.amount,
    kind: "money",
    defaultDirection: "desc",
  },
  dueDate: {
    getValue: (row) => row.dueDate,
    kind: "date",
    defaultDirection: "desc",
  },
  seq: { getValue: (row) => row.seq, kind: "number", defaultDirection: "desc" },
};

const FIXTURE: SampleRow[] = [
  {
    id: "a",
    label: "beta",
    roomNumber: "101",
    amount: "4500.00",
    dueDate: "2026-11-10",
    seq: 2,
  },
  {
    id: "b",
    label: "Alpha",
    roomNumber: "2",
    amount: "10000.50",
    dueDate: "2026-11-01",
    seq: 10,
  },
  {
    id: "c",
    label: "gamma",
    roomNumber: null,
    amount: null,
    dueDate: null,
    seq: 0,
  },
  {
    id: "d",
    label: "Alpha",
    roomNumber: "10",
    amount: "0.00",
    dueDate: "2026-11-15",
    seq: null,
  },
];

describe("table-sort", () => {
  it("toggles between columns using defaultDirection and flips asc/desc on repeat clicks", () => {
    const first = toggleSortState<SampleKey>(null, "amount", "desc");
    expect(first).toEqual({ key: "amount", direction: "desc" });

    const second = toggleSortState<SampleKey>(first, "amount", "desc");
    expect(second).toEqual({ key: "amount", direction: "asc" });

    const switched = toggleSortState<SampleKey>(second, "label", "asc");
    expect(switched).toEqual({ key: "label", direction: "asc" });
  });

  it("sorts text naturally and case-insensitively while preserving tie order", () => {
    const asc = sortRows(
      FIXTURE,
      { key: "roomNumber", direction: "asc" },
      COLUMNS,
    );
    expect(asc.map((r) => r.id)).toEqual(["b", "d", "a", "c"]);

    const desc = sortRows(
      FIXTURE,
      { key: "roomNumber", direction: "desc" },
      COLUMNS,
    );
    expect(desc.map((r) => r.id)).toEqual(["a", "d", "b", "c"]);

    const byLabelAsc = sortRows(
      FIXTURE,
      { key: "label", direction: "asc" },
      COLUMNS,
    );
    expect(byLabelAsc.map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("compares exact peso decimals using BigInt centavos and keeps empty values last", () => {
    const desc = sortRows(
      FIXTURE,
      { key: "amount", direction: "desc" },
      COLUMNS,
    );
    expect(desc.map((r) => r.id)).toEqual(["b", "a", "d", "c"]);

    const asc = sortRows(FIXTURE, { key: "amount", direction: "asc" }, COLUMNS);
    expect(asc.map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("sorts ISO dates chronologically and keeps numeric zero distinct from null", () => {
    const byDateAsc = sortRows(
      FIXTURE,
      { key: "dueDate", direction: "asc" },
      COLUMNS,
    );
    expect(byDateAsc.map((r) => r.id)).toEqual(["b", "a", "d", "c"]);

    const byDateDesc = sortRows(
      FIXTURE,
      { key: "dueDate", direction: "desc" },
      COLUMNS,
    );
    expect(byDateDesc.map((r) => r.id)).toEqual(["d", "a", "b", "c"]);

    const bySeqAsc = sortRows(
      FIXTURE,
      { key: "seq", direction: "asc" },
      COLUMNS,
    );
    expect(bySeqAsc.map((r) => r.id)).toEqual(["c", "a", "b", "d"]);

    const bySeqDesc = sortRows(
      FIXTURE,
      { key: "seq", direction: "desc" },
      COLUMNS,
    );
    expect(bySeqDesc.map((r) => r.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("returns a shallow copy in original order when sort is null", () => {
    const initial: SortState<SampleKey> | null = null;
    const sorted = sortRows(FIXTURE, initial, COLUMNS);
    expect(sorted).toEqual(FIXTURE);
    expect(sorted).not.toBe(FIXTURE);
  });
});
