"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type ApexChartsType from "apexcharts";
import type { ApexOptions } from "apexcharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCardHeader } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatPhpCurrency, parseMoneyDecimal } from "@/lib/money";

/**
 * Semantic chart palette derived from Daisy's Rausch and charcoal tokens.
 * Excludes violet/lavender hues per design guidelines.
 */
export const DAISY_CHART_COLORS = {
  rausch: "#e00b41",
  info: "#23597a",
  success: "#1f6440",
  warning: "#b47812",
  warningDark: "#7a5209",
  danger: "#c13515",
  dangerDeep: "#8f0629",
  charcoal: "#222222",
  slate: "#6a6a6a",
  stone: "#b8b8b8",
} as const;

export const DAISY_CHART_SEQUENCE = [
  DAISY_CHART_COLORS.info,
  DAISY_CHART_COLORS.success,
  DAISY_CHART_COLORS.rausch,
  DAISY_CHART_COLORS.warning,
  DAISY_CHART_COLORS.danger,
  DAISY_CHART_COLORS.charcoal,
  DAISY_CHART_COLORS.slate,
  DAISY_CHART_COLORS.dangerDeep,
] as const;

/**
 * Converts a validated monetary decimal string to a chart-plotting number.
 * All financial aggregation stays in BigInt centavos before display plotting.
 */
export function toChartPhpNumber(decimalAmount: string): number {
  const centavos = parseMoneyDecimal(decimalAmount);
  return Number(centavos) / 100;
}

/**
 * Formats a plotted numeric peso value cleanly with Philippine peso symbol.
 */
export function formatChartPhp(value: number): string {
  if (!Number.isFinite(value)) return "₱0.00";
  const centavos = BigInt(Math.round(value * 100));
  return formatPhpCurrency(centavos);
}

/**
 * Formats compact PHP labels for Y-axis ticks (e.g. ₱5k, ₱120k, ₱1.2M).
 */
export function formatCompactPhpAxis(value: number): string {
  if (!Number.isFinite(value)) return "₱0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const scaled = (abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1);
    return `${sign}₱${scaled}M`;
  }
  if (abs >= 1_000) {
    const scaled = (abs / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1);
    return `${sign}₱${scaled}k`;
  }
  return `${sign}₱${Math.round(abs).toLocaleString("en-PH")}`;
}

export type SupportedApexChartType =
  "bar" | "area" | "line" | "donut" | "pie" | "radialBar";

type ChartSeries = NonNullable<ApexOptions["series"]>;

type ApexChartProps = {
  type: SupportedApexChartType;
  series: ChartSeries;
  options: Omit<ApexOptions, "series">;
  height?: number;
  ariaLabel: string;
  className?: string;
};

/**
 * Lazy-loaded, SSR-safe ApexCharts wrapper aligned to Daisy tokens and reduced-motion rules.
 */
export function ApexChart({
  type,
  series,
  options,
  height = 280,
  ariaLabel,
  className,
}: ApexChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ApexChartsType | null>(null);
  const readyRef = useRef(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const chartKey = `${type}:${height}`;
  const loaded = loadedKey === chartKey;

  const mergedConfig = useMemo<ApexOptions>(() => {
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    return {
      ...options,
      series,
      colors: options.colors ?? [...DAISY_CHART_SEQUENCE],
      chart: {
        fontFamily: "var(--font-geist), system-ui, sans-serif",
        foreColor: "#6a6a6a",
        background: "transparent",
        parentHeightOffset: 0,
        redrawOnParentResize: true,
        redrawOnWindowResize: true,
        ...options.chart,
        type,
        height,
        toolbar: {
          show: false,
          ...options.chart?.toolbar,
        },
        zoom: {
          enabled: false,
          ...options.chart?.zoom,
        },
        animations: {
          enabled: !reducedMotion,
          speed: 380,
          dynamicAnimation: {
            enabled: !reducedMotion,
            speed: 260,
          },
          ...options.chart?.animations,
          ...(reducedMotion ? { enabled: false } : {}),
        },
      },
      grid: {
        borderColor: "#e4e4e4",
        strokeDashArray: 3,
        ...options.grid,
      },
      legend: {
        fontFamily: "var(--font-geist), system-ui, sans-serif",
        fontSize: "12px",
        labels: {
          colors: "#222222",
          ...options.legend?.labels,
        },
        markers: {
          size: 6,
          offsetX: -2,
          ...options.legend?.markers,
        },
        itemMargin: {
          horizontal: 10,
          vertical: 4,
          ...options.legend?.itemMargin,
        },
        ...options.legend,
      },
      tooltip: {
        theme: "light",
        style: {
          fontSize: "12px",
          fontFamily: "var(--font-geist), system-ui, sans-serif",
        },
        ...options.tooltip,
      },
      dataLabels: {
        style: {
          fontFamily: "var(--font-geist), system-ui, sans-serif",
          fontSize: "11px",
          fontWeight: 500,
        },
        ...options.dataLabels,
      },
    };
  }, [height, options, series, type]);

  const latestConfigRef = useRef<ApexOptions>(mergedConfig);
  const renderedConfigRef = useRef<ApexOptions | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;

    let cancelled = false;
    readyRef.current = false;
    renderedConfigRef.current = null;
    target.replaceChildren();
    target.style.minHeight = "";

    void import("apexcharts").then((mod) => {
      if (cancelled || !containerRef.current) return;
      const mountNode = containerRef.current;
      // Clear any leftover or aborted .apexcharts-canvas before appending a fresh chart.
      mountNode.replaceChildren();
      mountNode.style.minHeight = "";

      const initialConfig = latestConfigRef.current;
      renderedConfigRef.current = initialConfig;

      const ApexChartsCtor = mod.default;
      const chart = new ApexChartsCtor(mountNode, initialConfig);
      instanceRef.current = chart;
      void chart.render().then(() => {
        if (cancelled || instanceRef.current !== chart) return;
        readyRef.current = true;
        setLoadedKey(chartKey);
        if (latestConfigRef.current !== renderedConfigRef.current) {
          renderedConfigRef.current = latestConfigRef.current;
          void chart.updateOptions(latestConfigRef.current, false, false);
        }
      });
    });

    return () => {
      cancelled = true;
      readyRef.current = false;
      renderedConfigRef.current = null;
      const existing = instanceRef.current;
      instanceRef.current = null;
      if (existing) {
        // ApexCharts' destroy() leaves pending 150ms _windowResize timers active.
        const resizeTimer = (
          existing as unknown as {
            w?: { globals?: { resizeTimer?: number } };
          }
        ).w?.globals?.resizeTimer;
        if (typeof resizeTimer === "number") {
          window.clearTimeout(resizeTimer);
        }
        try {
          existing.destroy();
        } catch {
          // Ignore teardown errors if unmount occurred before mount settled.
        }
      }
      target.replaceChildren();
      target.style.minHeight = "";
    };
  }, [chartKey]);

  useEffect(() => {
    latestConfigRef.current = mergedConfig;
    if (!readyRef.current || !instanceRef.current) return;
    if (renderedConfigRef.current === mergedConfig) return;
    renderedConfigRef.current = mergedConfig;
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void instanceRef.current.updateOptions(mergedConfig, false, !reducedMotion);
  }, [mergedConfig]);

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn("relative w-full min-w-0", className)}
      style={{ minHeight: height }}
    >
      {!loaded && (
        <Skeleton
          className="absolute inset-0 h-full w-full rounded-control"
          style={{ height }}
        />
      )}
      <div
        ref={containerRef}
        className={cn("w-full min-w-0", !loaded && "opacity-0")}
      />
    </div>
  );
}

type ChartCardProps = {
  title: string;
  description?: string;
  summary?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

/**
 * Flat hairline panel container matching TableCardHeader styling for charts.
 */
export function ChartCard({
  title,
  description,
  summary,
  actions,
  className,
  bodyClassName,
  children,
}: ChartCardProps) {
  return (
    <Card className={cn("overflow-hidden p-0 sm:p-0", className)}>
      <TableCardHeader
        title={title}
        {...(description !== undefined ? { description } : {})}
        {...(summary !== undefined ? { count: summary } : {})}
        {...(actions !== undefined ? { actions } : {})}
      />
      <div className={cn("min-w-0 p-4 sm:p-5", bodyClassName)}>{children}</div>
    </Card>
  );
}
