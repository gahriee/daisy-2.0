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
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="ml-1 text-muted-foreground">(required)</span>
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
        <p id={errorId} className="text-sm leading-5 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
