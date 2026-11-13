import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@prisma/adapter-neon", () => ({ PrismaNeon: class {} }));
vi.mock("../../../../src/generated/prisma/client", () => ({
  PrismaClient: class {
    $disconnect = vi.fn().mockResolvedValue(undefined);
  },
}));

beforeEach(() => {
  vi.resetModules();
  Reflect.deleteProperty(globalThis, "daisyDatabase");
  vi.stubEnv("DATABASE_URL", "postgresql://local:example@localhost/daisy_dev");
});
afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(globalThis, "daisyDatabase");
});

it("reuses the runtime client across calls", async () => {
  const { getDatabase } = await import("../../../../src/server/db/client");
  expect(getDatabase()).toBe(getDatabase());
});

it("disconnects and replaces a client when connection configuration changes", async () => {
  const { getDatabase } = await import("../../../../src/server/db/client");
  const first = getDatabase();
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://local:example@localhost/daisy_other_dev",
  );
  expect(getDatabase()).not.toBe(first);
  expect(first.$disconnect).toHaveBeenCalledOnce();
});

it("fails before constructing a client when credentials are missing", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const { getDatabase } = await import("../../../../src/server/db/client");
  expect(getDatabase).toThrow("Configure a valid PostgreSQL DATABASE_URL");
});
