import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig({
  // Authenticated workspaces and domain APIs are strictly private and no-store;
  // static assets and the PII-free /offline shell are served from Wrangler ASSETS.
});

config.buildCommand = "pnpm exec next build --webpack";

export default config;
