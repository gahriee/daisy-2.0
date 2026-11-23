"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  MorphingAura,
  WebGLAmbientField,
} from "@/components/features/transients/public-booking-visual-fx";
import { cn } from "@/lib/cn";

type PublicBookingLoaderProps = {
  /**
   * "intro" plays the cursive Daisy + tablet tap -> OK -> 5-star sequence once
   * on `/book` entry and fades out to reveal the landing page.
   * "loading" loops cleanly inside Next.js `loading.tsx` while data streams.
   */
  mode?: "intro" | "loading";
  propertyName?: string;
};

const INTRO_SEEN_STORAGE_KEY = "daisy_book_intro_seen";
const INTRO_HOLD_MS = 2150;
const INTRO_FADE_MS = 320;

/**
 * Natural white-petaled daisy with a golden-yellow center and small green
 * leaves, retaining classic daisy colors across the primary-colored script.
 */
function DaisyBlossom({
  cx,
  cy,
  scale = 1,
  withLeaves = true,
  className,
}: {
  cx: number;
  cy: number;
  scale?: number;
  withLeaves?: boolean;
  className?: string;
}) {
  return (
    <g className={className} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
        {withLeaves && (
          <g fill="#4f9458">
            <ellipse
              cx="-9"
              cy="5"
              rx="5.2"
              ry="2.2"
              transform="rotate(-28 -9 5)"
            />
            <ellipse
              cx="9"
              cy="-4"
              rx="4.8"
              ry="2"
              transform="rotate(-32 9 -4)"
            />
          </g>
        )}
        {/* 6 crisp white petals with subtle outline for light-surface legibility */}
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <ellipse
            key={angle}
            cx="0"
            cy="-5.4"
            rx="2.6"
            ry="4.3"
            fill="#ffffff"
            stroke="#d6d3d1"
            strokeWidth="0.65"
            transform={`rotate(${angle})`}
          />
        ))}
        {/* Sunny golden-yellow daisy center */}
        <circle cx="0" cy="0" r="3.1" fill="#f4b400" />
        <circle cx="-0.7" cy="-0.7" r="1.05" fill="#ffd65a" />
      </g>
    </g>
  );
}

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
        "relative flex flex-col items-center justify-center overflow-hidden bg-surface px-4 text-foreground",
        mode === "intro"
          ? "fixed inset-0 z-50 transition-opacity duration-300 ease-out"
          : "min-h-screen w-full",
        phase === "exiting" && "pointer-events-none opacity-0",
      )}
    >
      {/* Live WebGL silk-wave backdrop */}
      <WebGLAmbientField intensity={0.85} />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        {/* Cursive primary-colored "daisy" with blooming daisies positioned cleanly above the circular aura */}
        <svg
          viewBox="90 8 245 94"
          fill="none"
          aria-hidden="true"
          className={cn(
            "relative z-20 mb-2 h-auto w-[225px] sm:w-[265px]",
            isLoop ? "book-loader-loop" : "book-loader-once",
          )}
        >
          {/* Self-drawing cursive "daisy" script in primary Rausch crimson */}
          <g className="book-loader-script-group">
            {/* d */}
            <path
              d="M 104 68 C 112 65, 120 58, 128 52 C 119 54, 114 67, 124 72 C 134 77, 148 59, 154 32 C 158 17, 151 15, 147 28 C 143 46, 139 67, 149 72 C 156 75, 163 67, 169 57"
              stroke="#e00b41"
              strokeWidth="4.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              className="book-loader-daisy-stroke book-loader-daisy-s1"
            />
            {/* a */}
            <path
              d="M 188 53 C 178 47, 166 56, 168 66 C 170 75, 182 74, 190 60 C 192 56, 193 52, 194 50 C 192 58, 191 68, 197 72 C 203 75, 210 66, 216 55"
              stroke="#e00b41"
              strokeWidth="4.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              className="book-loader-daisy-stroke book-loader-daisy-s2"
            />
            {/* i */}
            <path
              d="M 216 55 C 218 50, 220 49, 219 56 C 217 65, 218 72, 224 73 C 230 74, 238 66, 244 54"
              stroke="#e00b41"
              strokeWidth="4.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              className="book-loader-daisy-stroke book-loader-daisy-s3"
            />
            {/* s */}
            <path
              d="M 244 54 C 248 48, 256 47, 257 53 C 258 59, 261 67, 254 73 C 247 78, 238 73, 242 67 C 246 61, 257 65, 268 55"
              stroke="#e00b41"
              strokeWidth="4.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              className="book-loader-daisy-stroke book-loader-daisy-s4"
            />
            {/* y + flourish */}
            <path
              d="M 268 55 C 272 49, 274 55, 272 64 C 270 72, 278 75, 287 63 C 292 56, 295 49, 296 48 C 292 63, 286 81, 278 90 C 271 97, 264 91, 270 83 C 278 73, 298 67, 316 58"
              stroke="#e00b41"
              strokeWidth="4.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              className="book-loader-daisy-stroke book-loader-daisy-s5"
            />

            {/* Blooming white & yellow daisies all over the cursive "daisy" */}
            <DaisyBlossom
              cx={116}
              cy={58}
              scale={0.78}
              className="book-loader-flower book-loader-flower-1"
            />
            <DaisyBlossom
              cx={150}
              cy={25}
              scale={0.96}
              className="book-loader-flower book-loader-flower-2"
            />
            <DaisyBlossom
              cx={181}
              cy={70}
              scale={0.72}
              withLeaves={false}
              className="book-loader-flower book-loader-flower-2"
            />
            <DaisyBlossom
              cx={220}
              cy={37}
              scale={0.9}
              className="book-loader-flower book-loader-flower-3"
            />
            <DaisyBlossom
              cx={256}
              cy={47}
              scale={0.82}
              className="book-loader-flower book-loader-flower-4"
            />
            <DaisyBlossom
              cx={271}
              cy={87}
              scale={0.76}
              className="book-loader-flower book-loader-flower-5"
            />
            <DaisyBlossom
              cx={314}
              cy={57}
              scale={0.95}
              className="book-loader-flower book-loader-flower-5"
            />
          </g>
        </svg>

        {/* Circular morphing aura centered around the tablet & hands animation */}
        <div className="relative flex w-full items-center justify-center py-4">
          <MorphingAura className="absolute h-[290px] w-[290px] opacity-85 sm:h-[340px] sm:w-[340px]" />

          <svg
            viewBox="0 92 420 212"
            fill="none"
            aria-hidden="true"
            className={cn(
              "relative z-10 h-auto w-full max-w-[330px] sm:max-w-[380px]",
              isLoop ? "book-loader-loop" : "book-loader-once",
            )}
          >
            {/* Tablet + left hand holding it */}
            <g className="book-loader-tablet-group">
              {/* Tablet charcoal bezel */}
              <rect
                x="124"
                y="102"
                width="172"
                height="122"
                rx="8"
                fill="#57534e"
              />
              {/* Tablet screen */}
              <rect
                x="133"
                y="111"
                width="154"
                height="104"
                rx="3"
                fill="#ffffff"
              />

              {/* Left side of screen: boarding house building */}
              <rect
                x="148"
                y="126"
                width="58"
                height="74"
                rx="2"
                fill="#222222"
              />
              {/* Sunlit window bands */}
              <rect
                x="154"
                y="133"
                width="46"
                height="7"
                rx="1.5"
                fill="#f4b400"
              />
              <rect
                x="154"
                y="145"
                width="46"
                height="7"
                rx="1.5"
                fill="#f4b400"
              />
              <rect
                x="154"
                y="157"
                width="46"
                height="7"
                rx="1.5"
                fill="#f4b400"
              />
              <rect
                x="154"
                y="169"
                width="46"
                height="7"
                rx="1.5"
                fill="#f4b400"
              />
              {/* Doorway */}
              <rect x="167" y="182" width="20" height="18" fill="#ffffff" />
              <rect x="171" y="186" width="12" height="14" fill="#d4d4d4" />
              {/* Entrance step */}
              <polygon
                points="164,200 190,200 194,206 160,206"
                fill="#1f6440"
              />

              {/* Right side of screen: BOOK fades into 5 golden stars on tap */}
              <text
                x="247"
                y="133"
                textAnchor="middle"
                fill="#222222"
                fontSize="12"
                fontWeight="700"
                letterSpacing="0.06em"
                fontFamily="var(--font-geist), system-ui, sans-serif"
                className="book-loader-book-label"
              >
                BOOK
              </text>

              {/* 5-star row inside the tablet screen replacing BOOK on OK tap */}
              <g className="book-loader-inline-stars">
                {[227, 237, 247, 257, 267].map((sx, idx) => (
                  <g
                    key={sx}
                    className={
                      idx === 2
                        ? "book-loader-star-center"
                        : idx === 1 || idx === 3
                          ? "book-loader-star-mid"
                          : "book-loader-star-outer"
                    }
                    style={{ transformOrigin: `${sx}px 129px` }}
                  >
                    <path
                      d={`M${sx} 123.5l1.4 3 3.3.4-2.4 2.3.6 3.3-2.9-1.6-2.9 1.6.6-3.3-2.4-2.3 3.3-.4L${sx} 123.5Z`}
                      fill="#f4b400"
                    />
                  </g>
                ))}
              </g>

              {/* OK Button: starts Rausch crimson, flips to forest green on tap */}
              <g
                className="book-loader-ok-btn"
                style={{ transformOrigin: "247px 146px" }}
              >
                <rect
                  x="227"
                  y="138"
                  width="40"
                  height="16"
                  rx="3"
                  className="book-loader-ok-bg"
                />
                <text
                  x="247"
                  y="149.5"
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
                <rect x="228" y="159" width="11" height="7" rx="1" />
                <rect x="242" y="159" width="11" height="7" rx="1" />
                <rect x="256" y="159" width="11" height="7" rx="1" />
                <rect x="228" y="169" width="11" height="7" rx="1" />
                <rect x="242" y="169" width="11" height="7" rx="1" />
                <rect x="256" y="169" width="11" height="7" rx="1" />
              </g>

              {/* Room detail lines */}
              <g fill="#e4e4e4">
                <rect x="228" y="182" width="39" height="3" rx="1.5" />
                <rect x="228" y="188" width="34" height="3" rx="1.5" />
                <rect x="228" y="194" width="39" height="3" rx="1.5" />
                <rect x="228" y="200" width="28" height="3" rx="1.5" />
              </g>

              {/* Left hand gripping the tablet */}
              <g>
                <path
                  d="M124 162c-10 3-17 12-18 25l-4 32 23 11 10-20c3-6 2-13-2-18l-2-4c3-7 2-19-7-26Z"
                  fill="#f6b97a"
                />
                <path
                  d="M124 164c6 4 7 14 2 22l-5 8c-3-4-4-11-1-17l4-13Z"
                  fill="#e9a462"
                />
                <polygon
                  points="88,230 116,214 127,231 99,248"
                  fill="#f7f7f7"
                />
                {/* Primary Rausch sleeve */}
                <polygon points="38,286 90,228 124,248 76,300" fill="#e00b41" />
              </g>
            </g>

            {/* Right hand sliding in to tap the OK button */}
            <g className="book-loader-right-hand">
              <path
                d="M255 147c3-2 7-1 9 3l17 30 9-4c5-2 10 0 12 5l11 24c4 9 1 19-6 25l-25 14-26-44-7-15c-2-5 0-10 4-12l8-3-9-16c-2-3-1-6 3-7Z"
                fill="#f6b97a"
              />
              <path
                d="M279 182c3 4 4 10 2 15l-4-2c1-4 0-8-2-11l4-2Z"
                fill="#e9a462"
              />
              <polygon
                points="287,238 317,220 328,238 298,256"
                fill="#f7f7f7"
              />
              {/* Primary Rausch sleeve */}
              <polygon
                points="295,252 325,234 378,300 332,300"
                fill="#e00b41"
              />
            </g>
          </svg>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Preparing available rooms...
        </p>

        {mode === "intro" && (
          <button
            type="button"
            onClick={handleSkip}
            className="mt-5 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
