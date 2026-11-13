import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

let local: Record<string, string> = {};
try {
  local = parse(readFileSync(".env.local"));
} catch {
  /* Optional runtime configuration. */
}
try {
  Object.assign(process.env, parse(readFileSync(".env.test.local")));
} catch {
  /* Explicit environment also supported. */
}
const target = process.env.TEST_DATABASE_URL;
if (!target)
  throw new Error("Integration tests require an explicit TEST_DATABASE_URL.");
const testUrl = new URL(target);
const normalizedHost = (url: URL) => url.hostname.replace("-pooler", "");
for (const runtime of [local.DATABASE_URL, process.env.DATABASE_URL]) {
  if (
    runtime &&
    normalizedHost(new URL(runtime)) === normalizedHost(testUrl) &&
    new URL(runtime).pathname === testUrl.pathname
  )
    throw new Error(
      "Integration tests refuse the runtime/production database.",
    );
}
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
