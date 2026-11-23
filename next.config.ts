import type { NextConfig } from "next";

function resolveAllowedDevOrigins(): string[] {
  if (process.env.NODE_ENV !== "development") return [];
  const origins = new Set<string>([
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
  ]);

  const appOrigin = process.env.APP_ORIGIN?.trim();
  if (appOrigin) {
    try {
      const host = new URL(appOrigin).hostname;
      if (host && host !== "localhost" && host !== "127.0.0.1") {
        origins.add(host);
      }
    } catch {
      // Ignore malformed APP_ORIGIN during config load.
    }
  }

  const extra = process.env.ALLOWED_DEV_ORIGINS?.trim();
  if (extra) {
    for (const raw of extra.split(",")) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (trimmed.includes("://")) {
        try {
          origins.add(new URL(trimmed).hostname);
        } catch {
          // Ignore malformed entry.
        }
      } else {
        origins.add(trimmed.replace(/:\d+$/, ""));
      }
    }
  }

  return Array.from(origins);
}

const allowedDevOrigins = resolveAllowedDevOrigins();

const nextConfig: NextConfig = {
  /* config options here */
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  cacheComponents: true,
  partialPrefetching: true,
  logging: { incomingRequests: false, serverFunctions: false },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.arcgisonline.com https://*.openstreetmap.org; connect-src 'self' https://*.arcgisonline.com https://*.openstreetmap.org https://photon.komoot.io; worker-src 'self' blob:; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
      {
        source: "/book/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.arcgisonline.com https://*.openstreetmap.org; connect-src 'self' https://*.arcgisonline.com https://*.openstreetmap.org https://photon.komoot.io; worker-src 'self' blob:; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
