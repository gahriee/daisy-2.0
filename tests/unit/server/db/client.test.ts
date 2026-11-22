import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@prisma/adapter-neon", () => ({ PrismaNeon: class {} }));
vi.mock("../../../../src/generated/prisma/client", () => ({
  Prisma: {
    ModelName: { Owner: "Owner" },
    OwnerScalarFieldEnum: { id: "id" },
  },
  PrismaClient: class {
    $disconnect = vi.fn().mockResolvedValue(undefined);
  },
}));

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for("__cloudflare-context__");
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);

beforeEach(() => {
  vi.resetModules();
  Reflect.deleteProperty(globalThis, "daisyDatabase");
  Reflect.deleteProperty(globalThis, CLOUDFLARE_CONTEXT_SYMBOL);
  vi.stubEnv("DATABASE_URL", "postgresql://local:example@localhost/daisy_dev");
});
afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(globalThis, "daisyDatabase");
  Reflect.deleteProperty(globalThis, CLOUDFLARE_CONTEXT_SYMBOL);
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "navigator");
  }
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

it("reuses the global client across module reloads even when constructor identity differs", async () => {
  const { getDatabase: getFirst } =
    await import("../../../../src/server/db/client");
  const first = getFirst();

  vi.resetModules();
  vi.doMock("../../../../src/generated/prisma/client", () => ({
    Prisma: {
      ModelName: { Owner: "Owner" },
      OwnerScalarFieldEnum: { id: "id" },
    },
    PrismaClient: class {
      $disconnect = vi.fn().mockResolvedValue(undefined);
    },
  }));

  const { getDatabase: getSecond } =
    await import("../../../../src/server/db/client");
  const second = getSecond();

  expect(second).toBe(first);
  expect(first.$disconnect).not.toHaveBeenCalled();
});

it("disconnects and replaces the global client when the generated Prisma schema changes", async () => {
  const { getDatabase: getFirst } =
    await import("../../../../src/server/db/client");
  const first = getFirst();

  vi.resetModules();
  vi.doMock("../../../../src/generated/prisma/client", () => ({
    Prisma: {
      ModelName: { Owner: "Owner", NewModel: "NewModel" },
      OwnerScalarFieldEnum: { id: "id", addedField: "addedField" },
    },
    PrismaClient: class {
      $disconnect = vi.fn().mockResolvedValue(undefined);
    },
  }));

  const { getDatabase: getSecond } =
    await import("../../../../src/server/db/client");
  const second = getSecond();

  expect(second).not.toBe(first);
  expect(first.$disconnect).toHaveBeenCalledOnce();
});

it("fails before constructing a client when credentials are missing", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const { getDatabase } = await import("../../../../src/server/db/client");
  expect(getDatabase).toThrow("Configure a valid PostgreSQL DATABASE_URL");
});

it("isolates database clients per Cloudflare Worker request context while reusing within the same request", async () => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "Cloudflare-Workers" },
  });

  const { getDatabase } = await import("../../../../src/server/db/client");
  const ctx1 = { waitUntil: vi.fn() };
  const ctx2 = { waitUntil: vi.fn() };

  (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT_SYMBOL] = {
    ctx: ctx1,
  };
  const req1First = getDatabase();
  const req1Second = getDatabase();
  expect(req1Second).toBe(req1First);

  (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT_SYMBOL] = {
    ctx: ctx2,
  };
  const req2Client = getDatabase();
  expect(req2Client).not.toBe(req1First);
  expect(req1First.$disconnect).not.toHaveBeenCalled();
});
