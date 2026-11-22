import { describe, expect, it, vi } from "vitest";
import {
  BILLING_GENERATE_CRON,
  MAINTENANCE_CLEANUP_CRON,
  OVERDUE_SMS_CRON,
  dispatchScheduledCron,
  resolveScheduledJobPath,
} from "../../../../src/server/jobs/cloudflare-cron";

describe("cloudflare cron dispatcher", () => {
  it("maps documented schedules to scheduled job endpoints and ignores unknown crons", () => {
    expect(resolveScheduledJobPath(BILLING_GENERATE_CRON)).toBe(
      "/api/jobs/billing/generate",
    );
    expect(resolveScheduledJobPath(OVERDUE_SMS_CRON)).toBe(
      "/api/jobs/billing/overdue-sms",
    );
    expect(resolveScheduledJobPath(MAINTENANCE_CLEANUP_CRON)).toBe(
      "/api/jobs/maintenance/cleanup",
    );
    expect(resolveScheduledJobPath("0 * * * *")).toBeNull();
  });

  it("dispatches authorized POST requests with Bearer CRON_SECRET and configured APP_ORIGIN", async () => {
    const fetcher = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    const result = await dispatchScheduledCron({
      cron: BILLING_GENERATE_CRON,
      env: {
        APP_ORIGIN: "https://daisy.example.com/app",
        CRON_SECRET: "super-secret-token",
      },
      fetcher,
    });

    expect(result).toEqual({
      endpoint: "/api/jobs/billing/generate",
      status: 200,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const request = fetcher.mock.calls[0]?.[0];
    expect(request?.url).toBe(
      "https://daisy.example.com/api/jobs/billing/generate",
    );
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("authorization")).toBe(
      "Bearer super-secret-token",
    );
    expect(await request?.text()).toBe("{}");
  });

  it("fails closed when CRON_SECRET is missing or job returns an error status without leaking secrets", async () => {
    const secret = "do-not-leak-cron-secret";
    const fetcher = vi.fn<(request: Request) => Promise<Response>>();

    await expect(
      dispatchScheduledCron({
        cron: MAINTENANCE_CLEANUP_CRON,
        env: { CRON_SECRET: "   " },
        fetcher,
      }),
    ).rejects.toThrow("Scheduled job authentication secret is not configured.");
    expect(fetcher).not.toHaveBeenCalled();

    fetcher.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );
    await expect(
      dispatchScheduledCron({
        cron: MAINTENANCE_CLEANUP_CRON,
        env: { CRON_SECRET: secret },
        fetcher,
      }),
    ).rejects.toThrow(
      "Scheduled job /api/jobs/maintenance/cleanup failed with HTTP 401.",
    );
  });
});
