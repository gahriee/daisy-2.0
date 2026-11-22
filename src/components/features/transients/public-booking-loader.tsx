"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type PublicBookingLoaderProps = {
  /**
   * "intro" plays the full tablet tap -> OK -> 5-star sequence once on `/book`
   * entry and fades out to reveal the landing page.
   * "loading" loops cleanly inside Next.js `loading.tsx` while data streams.
   */
  mode?: "intro" | "loading";
  propertyName?: string;
};

const INTRO_SEEN_STORAGE_KEY = "daisy_book_intro_seen";
const INTRO_HOLD_MS = 1450;
const INTRO_FADE_MS = 300;

export function PublicBookingLoader({
  mode = "intro",
  propertyName = "Daisy",
}: PublicBookingLoaderProps) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "playing" | "exiting" | "done">(
    () => (mode === "loading" ? "playing" : "idle"),
  );

  useEffect(() => {
    if (mode !== "intro") return;

    if (pathname !== "/book") {
      const skipRouteTimer = window.setTimeout(() => setPhase("done"), 0);
      return () => window.clearTimeout(skipRouteTimer);
    }

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let alreadySeen = false;
    try {
      alreadySeen =
        window.sessionStorage.getItem(INTRO_SEEN_STORAGE_KEY) === "1";
    } catch {
      alreadySeen = false;
    }

    if (prefersReduced || alreadySeen) {
      delete document.documentElement.dataset.bookIntro;
      const doneImmediateTimer = window.setTimeout(() => setPhase("done"), 0);
      return () => window.clearTimeout(doneImmediateTimer);
    }

    const startTimer = window.setTimeout(() => {
      setPhase("playing");
      // Overlay is now opaque at z-50; reveal underlying content cleanly for fade-out.
      delete document.documentElement.dataset.bookIntro;
    }, 0);

    const fadeTimer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(INTRO_SEEN_STORAGE_KEY, "1");
      } catch {
        // Ignore storage quota/private-mode restrictions.
      }
      setPhase("exiting");
    }, INTRO_HOLD_MS);

    const doneTimer = window.setTimeout(() => {
      delete document.documentElement.dataset.bookIntro;
      setPhase("done");
    }, INTRO_HOLD_MS + INTRO_FADE_MS);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [mode, pathname]);

  function handleSkip() {
    try {
      window.sessionStorage.setItem(INTRO_SEEN_STORAGE_KEY, "1");
    } catch {
      // Ignore storage quota/private-mode restrictions.
    }
    delete document.documentElement.dataset.bookIntro;
    setPhase("done");
  }

  if (mode === "intro" && (phase === "idle" || phase === "done")) {
    return null;
  }

  const isLoop = mode === "loading";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading ${propertyName}`}
      className={cn(
        "flex flex-col items-center justify-center bg-surface px-4 text-foreground",
        mode === "intro"
          ? "fixed inset-0 z-50 transition-opacity duration-300 ease-out"
          : "min-h-screen w-full",
        phase === "exiting" && "pointer-events-none opacity-0",
      )}
    >
      <div className="flex w-full max-w-md flex-col items-center">
        <svg
          viewBox="0 0 420 270"
          fill="none"
          aria-hidden="true"
          className={cn(
            "h-auto w-full max-w-[340px] sm:max-w-[390px]",
            isLoop ? "book-loader-loop" : "book-loader-once",
          )}
        >
          {/* 5-star burst above the tablet (center 3 first, then outer 2) */}
          <g className="book-loader-stars">
            {/* Far-left small star */}
            <g
              className="book-loader-star book-loader-star-outer"
              style={{ transformOrigin: "130px 44px" }}
            >
              <path
                d="M130 33l2.9 6.2 6.8.9-5 4.7 1.3 6.7-6-3.3-6 3.3 1.3-6.7-5-4.7 6.8-.9L130 33Z"
                fill="#f4b400"
              />
            </g>
            {/* Mid-left medium star */}
            <g
              className="book-loader-star book-loader-star-mid"
              style={{ transformOrigin: "168px 40px" }}
            >
              <path
                d="M168 26l3.6 7.6 8.4 1.1-6.1 5.8 1.5 8.3-7.4-4-7.4 4 1.5-8.3-6.1-5.8 8.4-1.1L168 26Z"
                fill="#f4b400"
              />
            </g>
            {/* Center large star */}
            <g
              className="book-loader-star book-loader-star-center"
              style={{ transformOrigin: "210px 34px" }}
            >
              <path
                d="M210 15l4.9 10.4 11.4 1.5-8.3 7.9 2.1 11.2-10.1-5.4-10.1 5.4 2.1-11.2-8.3-7.9 11.4-1.5L210 15Z"
                fill="#f4b400"
              />
            </g>
            {/* Mid-right medium star */}
            <g
              className="book-loader-star book-loader-star-mid"
              style={{ transformOrigin: "252px 40px" }}
            >
              <path
                d="M252 26l3.6 7.6 8.4 1.1-6.1 5.8 1.5 8.3-7.4-4-7.4 4 1.5-8.3-6.1-5.8 8.4-1.1L252 26Z"
                fill="#f4b400"
              />
            </g>
            {/* Far-right small star */}
            <g
              className="book-loader-star book-loader-star-outer"
              style={{ transformOrigin: "290px 44px" }}
            >
              <path
                d="M290 33l2.9 6.2 6.8.9-5 4.7 1.3 6.7-6-3.3-6 3.3 1.3-6.7-5-4.7 6.8-.9L290 33Z"
                fill="#f4b400"
              />
            </g>
          </g>

          {/* Tablet + left hand holding it */}
          <g className="book-loader-tablet-group">
            {/* Tablet charcoal bezel */}
            <rect
              x="124"
              y="72"
              width="172"
              height="122"
              rx="8"
              fill="#57534e"
            />
            {/* Tablet screen */}
            <rect
              x="133"
              y="81"
              width="154"
              height="104"
              rx="3"
              fill="#ffffff"
            />

            {/* Left side of screen: boarding house / hotel building */}
            <rect x="148" y="96" width="58" height="74" rx="2" fill="#222222" />
            {/* Sunlit window bands */}
            <rect
              x="154"
              y="103"
              width="46"
              height="7"
              rx="1.5"
              fill="#f4b400"
            />
            <rect
              x="154"
              y="115"
              width="46"
              height="7"
              rx="1.5"
              fill="#f4b400"
            />
            <rect
              x="154"
              y="127"
              width="46"
              height="7"
              rx="1.5"
              fill="#f4b400"
            />
            <rect
              x="154"
              y="139"
              width="46"
              height="7"
              rx="1.5"
              fill="#f4b400"
            />
            {/* Doorway */}
            <rect x="167" y="152" width="20" height="18" fill="#ffffff" />
            <rect x="171" y="156" width="12" height="14" fill="#d4d4d4" />
            {/* Entrance step */}
            <polygon points="164,170 190,170 194,176 160,176" fill="#1f6440" />

            {/* Right side of screen: BOOK heading, OK button, mini calendar & lines */}
            <text
              x="247"
              y="103"
              textAnchor="middle"
              fill="#222222"
              fontSize="12"
              fontWeight="700"
              letterSpacing="0.06em"
              fontFamily="var(--font-geist), system-ui, sans-serif"
            >
              BOOK
            </text>

            {/* OK Button: starts Rausch crimson, flips to forest green on tap */}
            <g
              className="book-loader-ok-btn"
              style={{ transformOrigin: "247px 116px" }}
            >
              <rect
                x="227"
                y="108"
                width="40"
                height="16"
                rx="3"
                className="book-loader-ok-bg"
              />
              <text
                x="247"
                y="119.5"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10"
                fontWeight="700"
                letterSpacing="0.05em"
                fontFamily="var(--font-geist), system-ui, sans-serif"
              >
                OK
              </text>
            </g>

            {/* Mini date grid (3x2) */}
            <g fill="#d6d3d1">
              <rect x="228" y="129" width="11" height="7" rx="1" />
              <rect x="242" y="129" width="11" height="7" rx="1" />
              <rect x="256" y="129" width="11" height="7" rx="1" />
              <rect x="228" y="139" width="11" height="7" rx="1" />
              <rect x="242" y="139" width="11" height="7" rx="1" />
              <rect x="256" y="139" width="11" height="7" rx="1" />
            </g>

            {/* Room detail lines */}
            <g fill="#e4e4e4">
              <rect x="228" y="152" width="39" height="3" rx="1.5" />
              <rect x="228" y="158" width="34" height="3" rx="1.5" />
              <rect x="228" y="164" width="39" height="3" rx="1.5" />
              <rect x="228" y="170" width="28" height="3" rx="1.5" />
            </g>

            {/* Left hand gripping the tablet */}
            <g>
              {/* Palm & thumb */}
              <path
                d="M124 132c-10 3-17 12-18 25l-4 32 23 11 10-20c3-6 2-13-2-18l-2-4c3-7 2-19-7-26Z"
                fill="#f6b97a"
              />
              <path
                d="M124 134c6 4 7 14 2 22l-5 8c-3-4-4-11-1-17l4-13Z"
                fill="#e9a462"
              />
              {/* White cuff */}
              <polygon points="88,200 116,184 127,201 99,218" fill="#f7f7f7" />
              {/* Primary Rausch sleeve */}
              <polygon points="38,256 90,198 124,218 76,270" fill="#e00b41" />
            </g>
          </g>

          {/* Right hand sliding in to tap the OK button */}
          <g className="book-loader-right-hand">
            {/* Index finger & hand */}
            <path
              d="M255 117c3-2 7-1 9 3l17 30 9-4c5-2 10 0 12 5l11 24c4 9 1 19-6 25l-25 14-26-44-7-15c-2-5 0-10 4-12l8-3-9-16c-2-3-1-6 3-7Z"
              fill="#f6b97a"
            />
            {/* Finger crease shadow */}
            <path
              d="M279 152c3 4 4 10 2 15l-4-2c1-4 0-8-2-11l4-2Z"
              fill="#e9a462"
            />
            {/* White cuff */}
            <polygon points="287,208 317,190 328,208 298,226" fill="#f7f7f7" />
            {/* Primary Rausch sleeve */}
            <polygon points="295,222 325,204 378,270 332,270" fill="#e00b41" />
          </g>
        </svg>

        <p className="font-book-serif mt-2 text-2xl font-normal tracking-[0.06em] text-foreground uppercase">
          {propertyName}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Preparing available rooms...
        </p>

        {mode === "intro" && (
          <button
            type="button"
            onClick={handleSkip}
            className="mt-6 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
