import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  query: vi.fn(),
  storage: vi.fn(),
}));
vi.mock("@/server/auth/owner", () => ({ isOwner: mocks.owner }));
vi.mock("@/server/db/client", () => ({
  getDatabase: () => ({ $queryRaw: mocks.query }),
}));
vi.mock("@/server/storage/client", () => ({ checkStorage: mocks.storage }));
import { GET } from "../../../../src/app/api/system/status/route";
it("denies access before querying private services", async () => {
  mocks.owner.mockResolvedValue(false);
  expect((await GET()).status).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("checks the database and bucket for the Owner", async () => {
  mocks.owner.mockResolvedValue(true);
  mocks.query.mockResolvedValue([{ "?column?": 1 }]);
  mocks.storage.mockResolvedValue(undefined);
  expect(await (await GET()).json()).toEqual({
    database: "connected",
    auth: "owner",
    storage: "connected",
  });
});
it("redacts upstream failures", async () => {
  mocks.owner.mockRejectedValue(new Error("sensitive provider error"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Service unavailable" });
});
