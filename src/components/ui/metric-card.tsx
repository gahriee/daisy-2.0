import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const toneStyles = {
  neutral: {
    icon: "text-muted-foreground",
    value: "text-foreground",
  },
  success: {
    icon: "text-success",
    value: "text-success",
  },
  info: {
    icon: "text-info",
    value: "text-info",
  },
  warning: {
    icon: "text-warning",
    value: "text-warning",
  },
  muted: {
    icon: "text-muted-foreground",
    value: "text-muted-foreground",
  },
} as const;

export type MetricCardTone = keyof typeof toneStyles;

type MetricCardProps = {
  label: string;
  value: ReactNode;
  description: string;
  icon: ReactNode;
  tone?: MetricCardTone | undefined;
  className?: string | undefined;
};

/**
 * Operational KPI summary card with a top-right icon, vertically centered
 * tabular-numeral figure, and single-line factual description.
 */
export function MetricCard({
  label,
  value,
  description,
  icon,
  tone = "neutral",
  className,
}: MetricCardProps) {
  const style = toneStyles[tone];

  return (
    <Card className={cn("flex min-h-[152px] flex-col p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="pt-0.5 text-sm font-medium leading-5 text-muted-foreground">
          {label}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex shrink-0 items-center justify-center [&>svg]:size-7",
            style.icon,
          )}
        >
          {icon}
        </span>
      </div>

      <div className="flex flex-1 items-center py-3">
        <span
          className={cn(
            "text-2xl font-semibold leading-none tracking-tight tabular-nums sm:text-[1.75rem]",
            style.value,
          )}
        >
          {value}
        </span>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
    </Card>
  );
}
