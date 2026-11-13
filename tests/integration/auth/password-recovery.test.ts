import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../../src/generated/prisma/client";

const state = vi.hoisted(() => ({
  db: undefined as PrismaClient | undefined,
  provider: vi.fn(),
  matches: vi.fn(),
  failAudit: "",
})); // Test client is initialized before each route call.
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  getDatabase: () => {
    if (!state.db) throw new Error("Test client not ready");
    return state.db;
  },
}));
vi.mock("@/server/auth/server", () => ({
  getAuth: () => ({ handler: () => ({ POST: state.provider }) }),
}));
vi.mock("@/server/security/recovery-store", async (original) => {
  const actual =
    await original<
      typeof import("../../../src/server/security/recovery-store")
    >();
  return {
    ...actual,
    matchesOwnerEmail: state.matches,
    recordRecoveryEvent: (
      ...args: Parameters<typeof actual.recordRecoveryEvent>
    ) => {
      if (args[2] === state.failAudit) throw new Error("Audit unavailable");
      return actual.recordRecoveryEvent(...args);
    },
  };
});
import { POST } from "../../../src/app/api/auth/[...path]/route";
import { projectRecoveryNotification } from "../../../src/features/auth/recovery/notifications";

const prefix = `recovery-test-${randomUUID()}`;
let sequence = 0;
let owner = "";
beforeAll(() => {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Missing opted-in test connection");
  state.db = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });
});
beforeEach(() => {
  owner = `${prefix}-${sequence++}`;
  vi.stubEnv("OWNER_USER_ID", owner);
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv(
    "NEON_AUTH_COOKIE_SECRET",
    "test-secret-for-recovery-at-least-32-characters",
  );
  state.matches.mockReset().mockResolvedValue(true);
  state.failAudit = "";
  state.provider
    .mockReset()
    .mockImplementation(async () => Response.json({ success: true }));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  const db = state.db;
  if (!db) return;
  try {
    await db.securityEvent.deleteMany({
      where: { ownerUserId: { startsWith: prefix } },
    });
    await db.securityRateLimit.deleteMany({
      where: { key: { startsWith: `recovery:${prefix}` } },
    });
    expect(
      await db.securityEvent.count({
        where: { ownerUserId: { startsWith: prefix } },
      }),
    ).toBe(0);
    expect(
      await db.securityRateLimit.count({
        where: { key: { startsWith: `recovery:${prefix}` } },
      }),
    ).toBe(0);
  } finally {
    await db.$disconnect();
  }
});

function request(
  action: "request" | "reset",
  body: unknown,
  origin = "http://localhost:3000",
) {
  return new Request(`http://localhost:3000/api/auth/recovery/${action}`, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const email = "owner@example.test";
const identity = createHmac(
  "sha256",
  "test-secret-for-recovery-at-least-32-characters",
)
  .update(`daisy:recovery-limit:${email}`)
  .digest("hex");
const reset = { email, otp: "123456", password: "a-long-test-passphrase" };

it("records an identifier-only send attempt and calls the managed provider", async () => {
  expect((await POST(request("request", { email }))).status).toBe(202);
  const events = await state.db!.securityEvent.findMany({
    where: { ownerUserId: owner },
  });
  expect(events.map((event) => event.action)).toEqual(["RESET_REQUESTED"]);
  expect(JSON.stringify(events)).not.toContain(email);
  expect(new URL(state.provider.mock.calls[0]?.[0].url).pathname).toBe(
    "/api/auth/forget-password/email-otp",
  );
});
it("atomically limits concurrent requests using the shared database", async () => {
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => POST(request("request", { email }))),
  );
  expect(responses.filter((response) => response.status === 202)).toHaveLength(
    3,
  );
  expect(responses.filter((response) => response.status === 429)).toHaveLength(
    5,
  );
  expect(
    Number(
      responses
        .find((response) => response.status === 429)
        ?.headers.get("Retry-After"),
    ),
  ).toBeGreaterThan(0);
  expect(state.provider).toHaveBeenCalledTimes(3);
});
it("resets a password only for the bound Owner and projects its success notification", async () => {
  const response = await POST(request("reset", reset));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.notification.href).toBe("/auth/reset-password");
  const events = await state.db!.securityEvent.findMany({
    where: { ownerUserId: owner },
  });
  expect(events.map((event) => event.action).sort()).toEqual([
    "RESET_ATTEMPTED",
    "RESET_COMPLETED",
  ]);
  expect(JSON.stringify(events)).not.toContain(reset.password);
  expect(
    projectRecoveryNotification(
      events.find((event) => event.action === "RESET_COMPLETED")!,
      "foreign",
    ),
  ).toBeNull();
});
it("returns a generic acknowledgement for a foreign email without calling Auth", async () => {
  state.matches.mockResolvedValue(false);
  expect((await POST(request("request", { email }))).status).toBe(202);
  expect((await POST(request("reset", reset))).status).toBe(400);
  expect(state.provider).not.toHaveBeenCalled();
  expect(
    await state.db!.securityEvent.count({ where: { ownerUserId: owner } }),
  ).toBe(0);
});
it("rejects bad origins, malformed input and oversized requests before external calls", async () => {
  expect(
    (await POST(request("request", { email }, "https://foreign.test"))).status,
  ).toBe(403);
  expect(
    (await POST(request("reset", { ...reset, password: "short" }))).status,
  ).toBe(400);
  expect(
    (await POST(request("request", { email, filler: "x".repeat(5000) })))
      .status,
  ).toBe(413);
  expect(state.provider).not.toHaveBeenCalled();
});
it("retains failed reset attempts without exposing provider errors or cookies", async () => {
  state.provider.mockResolvedValue(
    Response.json(
      { token: "never-expose", error: "details" },
      { status: 400, headers: { "Set-Cookie": "secret=hidden" } },
    ),
  );
  const response = await POST(request("reset", reset));
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain("never-expose");
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(
    await state.db!.securityEvent.count({
      where: { ownerUserId: owner, action: "RESET_REJECTED" },
    }),
  ).toBe(1);
});
it("returns Retry-After for provider throttling", async () => {
  state.provider.mockResolvedValue(new Response(null, { status: 429 }));
  const response = await POST(request("reset", reset));
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
});
it("denies a missing Owner binding", async () => {
  vi.stubEnv("OWNER_USER_ID", "");
  expect((await POST(request("request", { email }))).status).toBe(503);
  expect(state.provider).not.toHaveBeenCalled();
});
it("checks the actual provider user table only within the configured Owner scope", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/server/security/recovery-store")
  >("../../../src/server/security/recovery-store");
  expect(await actual.matchesOwnerEmail(owner, email)).toBe(false);
});

it("does not call the provider when durable attempt recording fails", async () => {
  state.failAudit = "RESET_ATTEMPTED";
  expect((await POST(request("reset", reset))).status).toBe(503);
  expect(state.provider).not.toHaveBeenCalled();
});
it("preserves a potentially changed password outcome when the provider connection fails", async () => {
  state.provider.mockRejectedValue(new Error("Lost acknowledgement"));
  const response = await POST(request("reset", reset));
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain("may have changed");
  expect(
    await state.db!.securityEvent.count({
      where: { ownerUserId: owner, action: "RESET_ATTEMPTED" },
    }),
  ).toBe(1);
});
it("does not claim completion on a malformed provider acknowledgement", async () => {
  state.provider.mockResolvedValue(Response.json({ success: false }));
  const response = await POST(request("reset", reset));
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain("may have changed");
});
it("keeps the attempt when completion audit fails after the provider accepted the reset", async () => {
  state.failAudit = "RESET_COMPLETED";
  const response = await POST(request("reset", reset));
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain("may have changed");
  expect(
    await state.db!.securityEvent.count({
      where: { ownerUserId: owner, action: "RESET_ATTEMPTED" },
    }),
  ).toBe(1);
});
it("uses database time to renew an expired limit window", async () => {
  await state.db!.securityRateLimit.create({
    data: {
      key: `recovery:${owner}:send:${identity}`,
      count: 99,
      resetsAt: new Date(0),
    },
  });
  expect((await POST(request("request", { email }))).status).toBe(202);
  expect(
    (
      await state.db!.securityRateLimit.findUnique({
        where: { key: `recovery:${owner}:send:${identity}` },
      })
    )?.count,
  ).toBe(1);
});

it("keeps unrelated emails out of the Owner quota while preserving generic responses", async () => {
  state.matches.mockImplementation(
    async (_ownerId: string, suppliedEmail: string) => suppliedEmail === email,
  );
  for (let index = 0; index < 3; index++)
    expect(
      (await POST(request("request", { email: "other@example.test" }))).status,
    ).toBe(202);
  expect(
    (await POST(request("request", { email: "other@example.test" }))).status,
  ).toBe(429);
  expect((await POST(request("request", { email }))).status).toBe(202);
  expect(state.provider).toHaveBeenCalledTimes(1);
  const buckets = await state.db!.securityRateLimit.findMany({
    where: { key: { startsWith: `recovery:${owner}:` } },
  });
  expect(JSON.stringify(buckets)).not.toContain("@example.test");
});
it("keeps raw provider endpoints closed and refuses malformed JSON", async () => {
  expect(
    (
      await POST(
        new Request("http://localhost:3000/api/auth/email-otp/reset-password", {
          method: "POST",
        }),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await POST(
        new Request("http://localhost:3000/api/auth/recovery/request", {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "Content-Type": "application/json",
          },
          body: "{",
        }),
      )
    ).status,
  ).toBe(400);
  expect(state.provider).not.toHaveBeenCalled();
});
it("does not report another completion when the provider rejects a consumed code", async () => {
  state.provider
    .mockImplementationOnce(async () => Response.json({ success: true }))
    .mockImplementationOnce(async () => new Response(null, { status: 400 }));
  expect((await POST(request("reset", reset))).status).toBe(200);
  expect((await POST(request("reset", reset))).status).toBe(400);
  expect(
    await state.db!.securityEvent.count({
      where: { ownerUserId: owner, action: "RESET_COMPLETED" },
    }),
  ).toBe(1);
});
