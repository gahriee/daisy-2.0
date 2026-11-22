import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ServiceUnavailableError,
  UnauthenticatedError,
} from "../../../../src/lib/errors";
import { verifyCronSecret } from "../../../../src/server/jobs/auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyCronSecret", () => {
  it("fails closed with 503 when CRON_SECRET is missing and 401 when bearer header is absent or wrong", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(() =>
      verifyCronSecret(
        new Request("https://daisy.local/api/jobs/maintenance/cleanup", {
          method: "POST",
        }),
      ),
    ).toThrow(ServiceUnavailableError);

    vi.stubEnv("CRON_SECRET", "super-secret-cron-token");
    expect(() =>
      verifyCronSecret(
        new Request("https://daisy.local/api/jobs/maintenance/cleanup", {
          method: "POST",
        }),
      ),
    ).toThrow(UnauthenticatedError);

    expect(() =>
      verifyCronSecret(
        new Request("https://daisy.local/api/jobs/maintenance/cleanup", {
          method: "POST",
          headers: { authorization: "Bearer wrong-token" },
        }),
      ),
    ).toThrow(UnauthenticatedError);
  });

  it("accepts matching bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "super-secret-cron-token");
    expect(() =>
      verifyCronSecret(
        new Request("https://daisy.local/api/jobs/maintenance/cleanup", {
          method: "POST",
          headers: { authorization: "Bearer super-secret-cron-token" },
        }),
      ),
    ).not.toThrow();
  });
});
