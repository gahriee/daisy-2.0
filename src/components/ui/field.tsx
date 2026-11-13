import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type ControlProps = {
  id: string;
  required: boolean;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

type FieldProps = {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: ControlProps) => ReactNode;
};

/**
 * Form field wrapper connecting visible label, optional help text, non-color
 * error badge, and accessible control attributes.
 */
export function Field({
  id,
  label,
  description,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <label
        htmlFor={id}
        className="text-sm font-medium leading-5 text-foreground"
      >
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="ml-1 text-primary">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {description && (
        <p
          id={descriptionId}
          className="text-sm leading-5 text-muted-foreground"
        >
          {description}
        </p>
      )}
      {children({
        id,
        required,
        "aria-describedby":
          [descriptionId, errorId].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {error && (
        <p
          id={errorId}
          className="flex items-start gap-2 text-sm font-medium leading-5 text-danger"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 inline-grid size-4 shrink-0 place-items-center rounded-full bg-danger text-[11px] font-semibold leading-none text-primary-foreground"
          >
            !
          </span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
