"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Razor-thin GPU-composited scroll progress rail pinned to the bottom edge of
 * the sticky `/book` navigation bar.
 */
export function ScrollStoryProgress() {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mediaReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let rafId = 0;

    function update() {
      rafId = 0;
      const el = barRef.current;
      if (!el) return;
      const doc = document.documentElement;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      el.style.transform = `scaleX(${progress})`;
    }

    function schedule() {
      if (!rafId) {
        rafId = window.requestAnimationFrame(update);
      }
    }

    update();
    if (!mediaReduced.matches) {
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule, { passive: true });
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-transparent"
    >
      <div
        ref={barRef}
        className="h-full w-full origin-left bg-primary will-change-transform"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  variant?: "up" | "scale" | "fade";
};

/**
 * IntersectionObserver-driven cinematic reveal wrapper. Triggers once as the
 * element enters the viewport and stays immediately visible under reduced motion.
 */
export function ScrollReveal({
  children,
  className,
  delayMs = 0,
  variant = "up",
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const mediaReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaReduced.matches || typeof IntersectionObserver === "undefined") {
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const style: CSSProperties | undefined =
    delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined;

  return (
    <div
      ref={ref}
      data-visible={visible ? "true" : "false"}
      data-variant={variant}
      style={style}
      className={cn("book-scroll-reveal", className)}
    >
      {children}
    </div>
  );
}

/**
 * Returns a normalized `0..1` scroll progress as a section travels through the
 * viewport, throttled to `requestAnimationFrame` and disabled on reduced motion.
 */
export function useSectionScrollProgress(
  ref: React.RefObject<HTMLElement | null>,
): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const mediaReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaReduced.matches) return;

    let rafId = 0;

    function update() {
      rafId = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight || 1;
      const total = viewportH + rect.height;
      const raw = (viewportH - rect.top) / Math.max(1, total);
      const clamped = Math.min(1, Math.max(0, raw));
      setProgress(clamped);
    }

    function schedule() {
      if (!rafId) {
        rafId = window.requestAnimationFrame(update);
      }
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref]);

  return progress;
}
