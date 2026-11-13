/**
 * Shared Tailwind utility recipes for single-line, multiline, and select inputs.
 * Focus and active states use border styling only with zero hover styling or shadows.
 */
export const controlBaseClasses =
  "w-full min-w-0 rounded-control border border-control-border bg-surface text-base leading-6 text-foreground shadow-none placeholder:text-muted-foreground transition-[border-color,background-color] duration-(--duration-control) ease-(--ease-control) focus:outline-none focus-visible:outline-none focus:shadow-none focus-visible:shadow-none active:shadow-none not-disabled:focus:border-2 not-disabled:focus:border-primary not-disabled:active:border-2 not-disabled:active:border-primary not-disabled:focus:transition-none aria-invalid:border-2 aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:active:border-danger disabled:cursor-not-allowed disabled:border disabled:border-border disabled:bg-surface-muted disabled:text-muted-foreground";

export const editableControlClasses =
  "read-only:border read-only:border-border read-only:bg-surface-muted read-only:focus:border read-only:focus:border-border read-only:focus-visible:border-2 read-only:focus-visible:border-foreground read-only:active:border read-only:active:border-border";
