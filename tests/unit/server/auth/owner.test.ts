import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../../src/server/auth/server", () => ({
  getAuth: () => ({ getSession: mocks.session }),
}));
import { isOwner } from "../../../../src/server/auth/owner";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("fails closed without an Owner binding", async () => {
  vi.stubEnv("OWNER_USER_ID", "");
  expect(await isOwner()).toBe(false);
  expect(mocks.session).not.toHaveBeenCalled();
});
it.each(["owner", "foreign", "expired", "mismatched"])(
  "validates a fresh %s session",
  async (kind) => {
    vi.stubEnv("OWNER_USER_ID", "owner");
    mocks.session.mockResolvedValue({
      data: {
        user: { id: kind === "foreign" ? "foreign" : "owner" },
        session: {
          userId: kind === "mismatched" ? "foreign" : "owner",
          expiresAt: new Date(
            Date.now() + (kind === "expired" ? -60000 : 60000),
          ),
        },
      },
    });
    expect(await isOwner()).toBe(kind === "owner");
    expect(mocks.session).toHaveBeenCalledWith({
      query: { disableCookieCache: "true" },
    });
  },
);
