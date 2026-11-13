import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type DaisyMarkProps = ComponentProps<"svg">;

const PETAL_ANGLES = [0, 72, 144, 216, 288] as const;

const PETAL_PATH =
  "M14.14 11.15 13.08 6.58A3 3 0 1 1 18.92 6.58l-1.06 4.57a5.2 5.2 0 0 0-3.72 0Z";

/**
 * Geometric 5-petal architectural Daisy stencil framing an open center courtyard.
 */
export function DaisyMark({ className, ...props }: DaisyMarkProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      fill="currentColor"
      className={cn("shrink-0", className)}
      {...props}
    >
      {PETAL_ANGLES.map((angle) => (
        <path
          key={angle}
          transform={angle === 0 ? undefined : `rotate(${angle} 16 16)`}
          d={PETAL_PATH}
        />
      ))}
    </svg>
  );
}
