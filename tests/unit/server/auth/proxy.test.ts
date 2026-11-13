import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn(), owner: vi.fn() }));
vi.mock("@/features/auth/recovery/service", () => ({
  recoverPassword: vi.fn(),
}));
vi.mock("@/server/auth/server", () => ({
  getAuth: () => ({ handler: () => ({ POST: mocks.post }) }),
}));
vi.mock("@/server/auth/owner", () => ({ isOwner: mocks.owner }));
import { GET, POST } from "../../../../src/app/api/auth/[...path]/route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("blocks public registration", async () => {
  expect(
    (
      await POST(
        new Request("http://localhost/api/auth/sign-up/email", {
          method: "POST",
        }),
      )
    ).status,
  ).toBe(404);
  expect(mocks.post).not.toHaveBeenCalled();
});
it("denies a foreign origin", async () => {
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  expect(
    (
      await POST(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
          headers: { origin: "https://foreign.test" },
        }),
      )
    ).status,
  ).toBe(403);
});
it("returns only session authority, with private no-store headers", async () => {
  mocks.owner.mockResolvedValue(false);
  const response = await GET(
    new Request("http://localhost/api/auth/get-session"),
  );
  expect(await response.json()).toEqual({ authenticated: false });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("strips provider tokens while retaining session cookies", async () => {
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("OWNER_USER_ID", "owner");
  mocks.post.mockResolvedValue(
    Response.json(
      { token: "must-not-leak" },
      {
        headers: { "Set-Cookie": "session=example; HttpOnly; SameSite=Strict" },
      },
    ),
  );
  const response = await POST(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }),
  );
  expect(await response.json()).toEqual({ success: true });
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
});
it("maps upstream credential failures to 401 without leaking provider bodies", async () => {
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("OWNER_USER_ID", "owner");
  mocks.post.mockResolvedValue(
    Response.json({ message: "provider detail" }, { status: 401 }),
  );
  const response = await POST(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }),
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ success: false });
});
it("forwards 429 throttling with Retry-After header", async () => {
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("OWNER_USER_ID", "owner");
  mocks.post.mockResolvedValue(
    Response.json(
      { message: "slow down" },
      { status: 429, headers: { "Retry-After": "120" } },
    ),
  );
  const response = await POST(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("120");
  expect(await response.json()).toEqual({
    error: "Too many attempts. Try again shortly.",
  });
});
it("returns 503 when upstream auth fails with 5xx or throws", async () => {
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("OWNER_USER_ID", "owner");
  mocks.post.mockResolvedValueOnce(
    Response.json({ message: "db error" }, { status: 502 }),
  );
  const upstreamError = await POST(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }),
  );
  expect(upstreamError.status).toBe(503);
  expect(await upstreamError.json()).toEqual({
    error: "Authentication unavailable",
  });

  mocks.post.mockRejectedValueOnce(new Error("network down"));
  const thrown = await POST(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }),
  );
  expect(thrown.status).toBe(503);
  expect(await thrown.json()).toEqual({
    error: "Authentication unavailable",
  });
});
it("proxies sign-out with private no-store headers and cookies", async () => {
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("OWNER_USER_ID", "owner");
  mocks.post.mockResolvedValue(
    Response.json(
      { success: true },
      {
        headers: {
          "Set-Cookie": "session=; Max-Age=0; HttpOnly; SameSite=Strict",
        },
      },
    ),
  );
  const response = await POST(
    new Request("http://localhost/api/auth/sign-out", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  const forwarded = mocks.post.mock.calls[0]?.[0] as Request;
  expect(forwarded.headers.get("content-type")).toBe("application/json");
  expect(await forwarded.text()).toBe("{}");
});
