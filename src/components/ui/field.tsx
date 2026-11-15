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
  description?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
  children: (props: ControlProps) => ReactNode;
};

/**
 * Form field wrapper connecting visible label, control slot, optional help text
 * below the control, non-color error badge, and accessible control attributes.
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
    <div className={cn("grid min-w-0 content-start gap-1.5", className)}>
      <label
        htmlFor={id}
        className="text-[13px] font-medium leading-4 text-foreground"
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
      {children({
        id,
        required,
        "aria-describedby":
          [descriptionId, errorId].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {description && (
        <p
          id={descriptionId}
          className="text-xs leading-4 text-muted-foreground"
        >
          {description}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-[13px] font-medium leading-4 text-danger"
        >
          <span
            aria-hidden="true"
            className="mt-px inline-grid size-3.5 shrink-0 place-items-center rounded-full bg-danger text-[10px] font-semibold leading-none text-primary-foreground"
          >
            !
          </span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
