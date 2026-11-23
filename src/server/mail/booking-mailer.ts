import "server-only";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";

export const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";

export type BookingApprovedEmailInput = {
  toEmail: string;
  guestName: string;
  referenceCode: string;
  propertyName: string;
  propertyAddress: string | null;
  contactPhone: string | null;
  roomTitle: string;
  scopeLabel: string;
  checkInDateManila: string;
  checkOutDateManila: string;
  checkInTimeLabel: string;
  checkOutTimeLabel: string;
  nights: number;
  partySize: number;
  dailyRate: string;
  totalAmount: string;
  trackUrl: string;
};

export type BookingEmailSendOutcome =
  | { status: "sent"; messageId: string | null }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildBookingApprovedEmailContent(
  input: BookingApprovedEmailInput,
): {
  subject: string;
  text: string;
  html: string;
} {
  const checkInDisplay = formatManilaDate(input.checkInDateManila);
  const checkOutDisplay = formatManilaDate(input.checkOutDateManila);
  const nightsLabel = `${input.nights} ${input.nights === 1 ? "night" : "nights"}`;
  const guestsLabel = `${input.partySize} ${input.partySize === 1 ? "guest" : "guests"}`;
  const rateFormatted = formatPhpCurrency(input.dailyRate);
  const totalFormatted = formatPhpCurrency(input.totalAmount);

  const subject = `Booking confirmed (${input.referenceCode}) — ${input.propertyName}`;

  const textLines = [
    `Hi ${input.guestName},`,
    "",
    `Your stay request at ${input.propertyName} has been approved and confirmed.`,
    "",
    `Booking reference: ${input.referenceCode}`,
    `Room: ${input.roomTitle} (${input.scopeLabel})`,
    `Check-in: ${checkInDisplay}${input.checkInTimeLabel ? ` (${input.checkInTimeLabel})` : ""}`,
    `Check-out: ${checkOutDisplay}${input.checkOutTimeLabel ? ` (${input.checkOutTimeLabel})` : ""}`,
    `Length of stay: ${nightsLabel}`,
    `Guests: ${guestsLabel}`,
    `Nightly rate: ${rateFormatted}`,
    `Confirmed total: ${totalFormatted}`,
    "",
    input.propertyAddress ? `Location: ${input.propertyAddress}` : null,
    input.contactPhone ? `Front desk: ${input.contactPhone}` : null,
    `Track your booking status anytime: ${input.trackUrl}`,
    "",
    `Thank you,`,
    input.propertyName,
  ].filter((line): line is string => line !== null);

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f7f7f7;color:#222222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e4;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:24px 28px;border-bottom:1px solid #e4e4e4;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#1f6440;">Booking confirmed</p>
          <h1 style="margin:0;font-size:22px;line-height:1.25;font-weight:600;color:#222222;">${escapeHtml(input.propertyName)}</h1>
          <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#6a6a6a;">Hi ${escapeHtml(input.guestName)}, your stay request has been approved by the host.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:22px 28px;">
          <div style="margin-bottom:18px;padding:12px 14px;background:#ffe8ee;border-radius:8px;">
            <span style="display:block;font-size:11px;color:#8f0629;">Booking reference</span>
            <span style="display:block;margin-top:2px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;font-weight:700;color:#222222;">${escapeHtml(input.referenceCode)}</span>
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;">
            <tr><td style="padding:5px 0;color:#6a6a6a;">Room</td><td align="right" style="padding:5px 0;font-weight:600;color:#222222;">${escapeHtml(input.roomTitle)}</td></tr>
            <tr><td style="padding:5px 0;color:#6a6a6a;">Room setup</td><td align="right" style="padding:5px 0;color:#222222;">${escapeHtml(input.scopeLabel)}</td></tr>
            <tr><td style="padding:5px 0;color:#6a6a6a;">Check-in</td><td align="right" style="padding:5px 0;color:#222222;">${escapeHtml(checkInDisplay)}${input.checkInTimeLabel ? `, ${escapeHtml(input.checkInTimeLabel)}` : ""}</td></tr>
            <tr><td style="padding:5px 0;color:#6a6a6a;">Check-out</td><td align="right" style="padding:5px 0;color:#222222;">${escapeHtml(checkOutDisplay)}${input.checkOutTimeLabel ? `, ${escapeHtml(input.checkOutTimeLabel)}` : ""}</td></tr>
            <tr><td style="padding:5px 0;color:#6a6a6a;">Stay &amp; guests</td><td align="right" style="padding:5px 0;color:#222222;">${escapeHtml(nightsLabel)}, ${escapeHtml(guestsLabel)}</td></tr>
            <tr><td style="padding:5px 0;color:#6a6a6a;">Nightly rate</td><td align="right" style="padding:5px 0;color:#222222;">${escapeHtml(rateFormatted)}</td></tr>
            <tr><td style="padding:12px 0 4px;border-top:1px solid #e4e4e4;font-weight:600;color:#222222;">Confirmed total</td><td align="right" style="padding:12px 0 4px;border-top:1px solid #e4e4e4;font-size:16px;font-weight:700;color:#222222;">${escapeHtml(totalFormatted)}</td></tr>
          </table>
          <div style="margin-top:22px;">
            <a href="${escapeHtml(input.trackUrl)}" style="display:inline-block;padding:11px 18px;background:#e00b41;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">Track booking status</a>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px;background:#f7f7f7;border-top:1px solid #e4e4e4;font-size:12px;line-height:1.5;color:#6a6a6a;">
          ${input.propertyAddress ? `<div>${escapeHtml(input.propertyAddress)}</div>` : ""}
          ${input.contactPhone ? `<div>Front desk: ${escapeHtml(input.contactPhone)}</div>` : ""}
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject,
    text: textLines.join("\n"),
    html,
  };
}

/**
 * Workers-compatible transactional email sender using Resend's HTTP API.
 * Designed to run outside database transactions and never throw or log secrets/PII.
 */
export async function sendBookingApprovedEmailSafe(
  input: BookingApprovedEmailInput,
  options: {
    apiKey?: string | undefined;
    fromEmail?: string | undefined;
    endpoint?: string | undefined;
    fetcher?: typeof fetch | undefined;
  } = {},
): Promise<BookingEmailSendOutcome> {
  const apiKey = (options.apiKey ?? process.env.RESEND_API_KEY)?.trim() ?? "";
  const fromEmail = (options.fromEmail ?? process.env.MAIL_FROM)?.trim() ?? "";
  const toEmail = input.toEmail.trim().toLowerCase();

  if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return { status: "skipped", reason: "Guest email address is missing." };
  }
  if (!apiKey || !fromEmail) {
    return {
      status: "skipped",
      reason: "Email delivery is not configured yet.",
    };
  }

  const content = buildBookingApprovedEmailContent(input);
  const fetchImpl = options.fetcher ?? fetch;
  const endpoint =
    (options.endpoint ?? process.env.RESEND_API_URL)?.trim() ||
    RESEND_EMAILS_ENDPOINT;

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      return {
        status: "failed",
        reason: `Email provider returned HTTP ${response.status}.`,
      };
    }

    let messageId: string | null = null;
    try {
      const data = (await response.json()) as { id?: unknown };
      if (typeof data?.id === "string") {
        messageId = data.id;
      }
    } catch {
      messageId = null;
    }

    return { status: "sent", messageId };
  } catch {
    return {
      status: "failed",
      reason: "Could not reach the email provider right now.",
    };
  }
}
