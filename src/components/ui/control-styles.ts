/**
 * Shared Tailwind utility recipes for single-line, multiline, and select inputs.
 * Focus and active states use 1px border styling only with zero hover styling or shadows.
 */
export const controlBaseClasses =
  "w-full min-w-0 rounded-control border border-control-border bg-surface text-base leading-6 text-foreground shadow-none placeholder:text-muted-foreground transition-[border-color,background-color] duration-(--duration-control) ease-(--ease-control) focus:outline-none focus-visible:outline-none focus:shadow-none focus-visible:shadow-none active:shadow-none not-disabled:focus:border-primary not-disabled:active:border-primary not-disabled:focus:transition-none aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:active:border-danger disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-muted-foreground";

export const compactSingleLineSizingClasses =
  "min-h-10 py-1.5 text-base leading-5 sm:min-h-9 sm:text-sm";

export const editableControlClasses =
  "read-only:border-border read-only:bg-surface-muted read-only:focus:border-border read-only:focus-visible:border-foreground read-only:active:border-border";
