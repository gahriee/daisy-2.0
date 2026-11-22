import { cn } from "@/lib/cn";

const PETAL_ANGLES = [0, 72, 144, 216, 288] as const;

const PETAL_PATH =
  "M14.14 11.15 13.08 6.58A3 3 0 1 1 18.92 6.58l-1.06 4.57a5.2 5.2 0 0 0-3.72 0Z";

const SIZE_CLASSES = {
  sm: "size-8",
  md: "size-12",
  lg: "size-14",
} as const;

/**
 * Animated 5-petal Daisy logo loader for non-skeleton transitions (sign-in,
 * auth/offline route boots, and standalone loading states). Respects
 * `prefers-reduced-motion`.
 */
export function DaisyLogoLoader({
  label = "Loading…",
  size = "md",
  fullScreen = false,
  className,
}: {
  label?: string;
  size?: keyof typeof SIZE_CLASSES;
  fullScreen?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex flex-col items-center justify-center gap-3.5 text-center",
        fullScreen && "min-h-svh w-full bg-background px-4",
        className,
      )}
    >
      <div className="relative inline-flex items-center justify-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 32 32"
          fill="currentColor"
          className={cn(
            "daisy-logo-orbit shrink-0 text-primary",
            SIZE_CLASSES[size],
          )}
        >
          {PETAL_ANGLES.map((angle, index) => (
            <path
              key={angle}
              transform={angle === 0 ? undefined : `rotate(${angle} 16 16)`}
              d={PETAL_PATH}
              className="daisy-petal-bloom"
              style={{ animationDelay: `${index * 160}ms` }}
            />
          ))}
        </svg>
      </div>
      {label && (
        <p className="text-sm font-medium tracking-tight text-muted-foreground">
          {label}
        </p>
      )}
    </div>
  );
}
