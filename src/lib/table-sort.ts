import { parseMoneyDecimal } from "@/lib/money";

export type SortDirection = "asc" | "desc";

export type SortState<K extends string = string> = {
  key: K;
  direction: SortDirection;
};

export type SortKind = "auto" | "text" | "number" | "money" | "date";

export type SortValue =
  string | number | bigint | Date | boolean | null | undefined;

export type SortColumnDef<T> = {
  getValue: (row: T) => SortValue;
  defaultDirection?: SortDirection;
  kind?: SortKind;
};

const NATURAL_TEXT_COLLATOR = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

type ComparableValue =
  | { type: "number"; value: number }
  | { type: "bigint"; value: bigint }
  | { type: "text"; value: string };

function normalizeValue(
  raw: SortValue,
  kind: SortKind,
): ComparableValue | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return null;

    if (kind === "money") {
      try {
        return { type: "bigint", value: parseMoneyDecimal(trimmed) };
      } catch {
        return null;
      }
    }

    if (kind === "date") {
      const ms = Date.parse(trimmed);
      return Number.isFinite(ms) ? { type: "number", value: ms } : null;
    }

    if (kind === "number") {
      const num = Number(trimmed);
      return Number.isFinite(num) ? { type: "number", value: num } : null;
    }

    return { type: "text", value: trimmed };
  }

  if (typeof raw === "bigint") {
    return { type: "bigint", value: raw };
  }

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { type: "number", value: raw } : null;
  }

  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) ? { type: "number", value: ms } : null;
  }

  if (typeof raw === "boolean") {
    return { type: "number", value: raw ? 1 : 0 };
  }

  return null;
}

function compareComparableValues(
  a: ComparableValue,
  b: ComparableValue,
): number {
  if (a.type === "bigint" && b.type === "bigint") {
    if (a.value < b.value) return -1;
    if (a.value > b.value) return 1;
    return 0;
  }

  if (a.type === "number" && b.type === "number") {
    if (a.value < b.value) return -1;
    if (a.value > b.value) return 1;
    return 0;
  }

  return NATURAL_TEXT_COLLATOR.compare(String(a.value), String(b.value));
}

/**
 * Transitions header sort state when a column header is clicked.
 * Activating a new column starts at its `defaultDirection` (defaulting to `"asc"`);
 * clicking the active column toggles between `"asc"` and `"desc"`.
 */
export function toggleSortState<K extends string>(
  current: SortState<K> | null,
  key: K,
  defaultDirection: SortDirection = "asc",
): SortState<K> {
  if (current && current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return {
    key,
    direction: defaultDirection,
  };
}

/**
 * Returns a new stably sorted array according to `sort` and `columns`.
 * Missing/empty values (`null`, `undefined`, blank strings, invalid numbers/dates)
 * always sort last regardless of direction so incomplete records stay out of the way.
 */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K> | null,
  columns: Record<K, SortColumnDef<T>>,
): T[] {
  if (!sort) {
    return [...rows];
  }

  const column = columns[sort.key];
  if (!column) {
    return [...rows];
  }

  const kind = column.kind ?? "auto";
  const decorated = rows.map((row, index) => ({
    row,
    index,
    value: normalizeValue(column.getValue(row), kind),
  }));

  decorated.sort((a, b) => {
    if (a.value === null && b.value === null) {
      return a.index - b.index;
    }
    if (a.value === null) return 1;
    if (b.value === null) return -1;

    const cmp = compareComparableValues(a.value, b.value);
    if (cmp !== 0) {
      return sort.direction === "asc" ? cmp : -cmp;
    }

    return a.index - b.index;
  });

  return decorated.map((item) => item.row);
}
