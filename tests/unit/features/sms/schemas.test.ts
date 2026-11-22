import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OVERDUE_SMS_TEMPLATE,
  estimateSmsSegments,
  normalizePhilippineMobileNumber,
  renderOverdueSmsTemplate,
  SendTestOverdueSmsSchema,
} from "../../../../src/features/sms/schemas";
import { SmsSettingsUpdateSchema } from "../../../../src/features/settings/schemas";

vi.mock("server-only", () => ({}));

import {
  decryptAppSecret,
  encryptAppSecret,
  maskSecretLast4,
} from "../../../../src/server/security/secret-box";
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

  it("validates SmsSettingsUpdateSchema constraints (schedule, sender name & TEST prefix)", () => {
    const valid = SmsSettingsUpdateSchema.safeParse({
      module: "sms",
      expectedVersion: 1,
      smsOverdueEnabled: true,
      smsOverdueFrequencyDays: 3,
      smsOverdueSendTimeManila: "09:30",
      smsApiKey: "sem_live_1234567890",
      clearSmsApiKey: false,
      smsSenderName: "DAISYBH",
      smsOverdueTemplate: "Reminder: {{tenantName}} owes {{balance}}.",
    });
    expect(valid.success).toBe(true);

    const badFrequency = SmsSettingsUpdateSchema.safeParse({
      module: "sms",
      expectedVersion: 1,
      smsOverdueEnabled: true,
      smsOverdueFrequencyDays: 0,
      smsOverdueSendTimeManila: "09:00",
      smsApiKey: null,
      clearSmsApiKey: false,
      smsSenderName: null,
      smsOverdueTemplate: null,
    });
    expect(badFrequency.success).toBe(false);

    const badTime = SmsSettingsUpdateSchema.safeParse({
      module: "sms",
      expectedVersion: 1,
      smsOverdueEnabled: true,
      smsOverdueFrequencyDays: 1,
      smsOverdueSendTimeManila: "25:99",
      smsApiKey: null,
      clearSmsApiKey: false,
      smsSenderName: null,
      smsOverdueTemplate: null,
    });
    expect(badTime.success).toBe(false);

    const badTestPrefix = SmsSettingsUpdateSchema.safeParse({
      module: "sms",
      expectedVersion: 1,
      smsOverdueEnabled: false,
      smsOverdueFrequencyDays: 1,
      smsOverdueSendTimeManila: "09:00",
      smsApiKey: null,
      clearSmsApiKey: false,
      smsSenderName: null,
      smsOverdueTemplate: "TEST overdue reminder",
    });
    expect(badTestPrefix.success).toBe(false);

    const badSender = SmsSettingsUpdateSchema.safeParse({
      module: "sms",
      expectedVersion: 1,
      smsOverdueEnabled: false,
      smsOverdueFrequencyDays: 1,
      smsOverdueSendTimeManila: "09:00",
      smsApiKey: null,
      clearSmsApiKey: false,
      smsSenderName: "TOO LONG SENDER NAME",
      smsOverdueTemplate: null,
    });
    expect(badSender.success).toBe(false);

    expect(
      SendTestOverdueSmsSchema.safeParse({
        phone: "0917 123 4567",
        messageTemplate: "Hi {{tenantName}}, reminder for Room {{roomNumber}}.",
        senderName: "DAISYBH",
      }).success,
    ).toBe(true);
    expect(
      SendTestOverdueSmsSchema.safeParse({
        phone: "09171234567",
        messageTemplate: "TEST hello",
      }).success,
    ).toBe(false);
  });

  it("encrypts and decrypts API secrets via AES-256-GCM and masks last 4 characters", () => {
    const env = { SYNC_CURSOR_SECRET: "unit-test-secret-key-material" };
    const secret = "semaphore_api_key_9876543210abcd";
    const encrypted = encryptAppSecret(secret, env);
    expect(encrypted).not.toContain(secret);
    expect(decryptAppSecret(encrypted, env)).toBe(secret);
    expect(maskSecretLast4(secret)).toBe("abcd");
    expect(() =>
      decryptAppSecret(encrypted, { SYNC_CURSOR_SECRET: "different-secret" }),
    ).toThrow("Stored API key could not be decrypted");
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
