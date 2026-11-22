import { Suspense, type ReactNode } from "react";
import { Cormorant_Garamond } from "next/font/google";
import { PublicBookingLoader } from "@/components/features/transients/public-booking-loader";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-book-serif",
  display: "swap",
});

/**
 * Fixed developer-authored pre-paint script (no user input) that hides the
 * landing page HTML before first paint only on a visitor's first `/book` entry
 * in this browser session, preventing a flash of the page before the loader.
 */
const BOOK_INTRO_PREPAINT_SCRIPT = `(function(){try{if(location.pathname==="/book"&&sessionStorage.getItem("daisy_book_intro_seen")!=="1"&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.dataset.bookIntro="active";setTimeout(function(){if(document.documentElement.dataset.bookIntro==="active"){delete document.documentElement.dataset.bookIntro;}},3000);}}catch(e){}})();`;

export default function PublicBookLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className={cormorant.variable}>
      <script
        dangerouslySetInnerHTML={{ __html: BOOK_INTRO_PREPAINT_SCRIPT }}
      />
      <Suspense fallback={null}>
        <PublicBookingLoader mode="intro" propertyName="Daisy" />
      </Suspense>
      <div className="book-intro-content">{children}</div>
    </div>
  );
}
