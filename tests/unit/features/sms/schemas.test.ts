import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OVERDUE_SMS_TEMPLATE,
  estimateSmsSegments,
  normalizePhilippineMobileNumber,
  renderOverdueSmsTemplate,
} from "../../../../src/features/sms/schemas";

vi.mock("server-only", () => ({}));

import { sendSemaphoreSms } from "../../../../src/server/sms/semaphore";

describe("overdue SMS schemas, template rendering, and PH mobile normalization", () => {
  it("normalizes Philippine mobile numbers to 09XXXXXXXXX and rejects invalid numbers", () => {
    expect(normalizePhilippineMobileNumber("0917 123 4567")).toBe(
      "09171234567",
    );
    expect(normalizePhilippineMobileNumber("+63 917-123-4567")).toBe(
      "09171234567",
    );
    expect(normalizePhilippineMobileNumber("639981234567")).toBe("09981234567");
    expect(normalizePhilippineMobileNumber("9171234567")).toBe("09171234567");
    expect(normalizePhilippineMobileNumber("")).toBeNull();
    expect(normalizePhilippineMobileNumber("02-8888-1234")).toBeNull();
    expect(normalizePhilippineMobileNumber("091712345")).toBeNull();
  });

  it("renders default and custom templates with all placeholders and estimates SMS segments", () => {
    const rendered = renderOverdueSmsTemplate(null, {
      tenantName: "Maria Santos",
      roomNumber: "201",
      invoiceNumber: "INV-2026-000012",
      billingPeriod: "Nov 2026",
      dueDate: "Nov 6, 2026",
      balance: "PHP 4,500.00",
      daysOverdue: 3,
      businessName: "Daisy Residences",
    });
    expect(rendered).toContain("Maria Santos");
    expect(rendered).toContain("Room 201");
    expect(rendered).toContain("INV-2026-000012");
    expect(rendered).toContain("PHP 4,500.00");
    expect(rendered).toContain("3 day(s) overdue");
    expect(rendered).toContain("Daisy Residences");
    expect(DEFAULT_OVERDUE_SMS_TEMPLATE.length).toBeGreaterThan(20);

    expect(estimateSmsSegments("Hello world")).toEqual({
      length: 11,
      segments: 1,
      encoding: "GSM",
    });
    expect(estimateSmsSegments("A".repeat(161))).toEqual({
      length: 161,
      segments: 2,
      encoding: "GSM",
    });
    expect(estimateSmsSegments("₱4,500.00")).toEqual({
      length: 9,
      segments: 1,
      encoding: "UNICODE",
    });
  });

  it("sends form-urlencoded POST requests to Semaphore API v4 and handles errors safely", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            message_id: 998877,
            status: "Pending",
            network: "Globe",
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const res = await sendSemaphoreSms({
      apiKey: "sem-key-secret",
      recipient: "09171234567",
      message: "Rent overdue notice for Room 201.",
      senderName: "DAISYBH",
      fetcher,
    });

    expect(res).toEqual({
      messageId: "998877",
      status: "Pending",
      network: "Globe",
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://api.semaphore.co/api/v4/messages");
    expect(init?.method).toBe("POST");
    const params = new URLSearchParams(String(init?.body ?? ""));
    expect(params.get("apikey")).toBe("sem-key-secret");
    expect(params.get("number")).toBe("09171234567");
    expect(params.get("sendername")).toBe("DAISYBH");

    await expect(
      sendSemaphoreSms({
        apiKey: "sem-key-secret",
        recipient: "09171234567",
        message: "TEST message",
        fetcher,
      }),
    ).rejects.toThrow('Semaphore ignores messages starting with "TEST"');
  });
});
