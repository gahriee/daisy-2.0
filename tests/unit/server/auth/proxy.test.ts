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
