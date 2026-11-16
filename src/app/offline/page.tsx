import { OfflineRouteFallback } from "@/components/features/offline/offline-route-fallback";

/**
 * Dedicated PII-free public bootstrap shell for the PWA Service Worker.
 * Never touches server sessions or databases so Cache Storage holds zero personal data.
 */
export default function OfflinePage() {
  return <OfflineRouteFallback />;
}
