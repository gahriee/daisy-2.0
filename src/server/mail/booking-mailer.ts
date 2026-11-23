import "server-only";
import nodemailer from "nodemailer";
import {
  buildGrabBookingUrl,
  buildMapDirectionsUrl,
} from "@/features/transients/public-booking-view";
import { formatManilaDate } from "@/lib/dates";
import { formatPhpCurrency } from "@/lib/money";
import { getDatabase } from "@/server/db/client";
import { decryptAppSecret } from "@/server/security/secret-box";

export type SmtpTransportConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName?: string | null;
  fromEmail: string;
};

export type SmtpMailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string;
  contentDisposition: "inline";
};

export type SmtpMailSender = {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    attachments?: SmtpMailAttachment[];
  }): Promise<{ messageId?: unknown }>;
  close?: () => void;
};

export type SmtpTransportFactory = (
  config: SmtpTransportConfig,
) => SmtpMailSender;

export type BookingApprovedEmailInput = {
  toEmail: string;
  guestName: string;
  referenceCode: string;
  propertyName: string;
  propertyAddress: string | null;
  propertyLatitude?: number | null | undefined;
  propertyLongitude?: number | null | undefined;
  contactPhone: string | null;
  roomTitle: string;
  scopeLabel: string;
  roomPhotoUrl?: string | null | undefined;
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SAMPLE_PREVIEW_ROOM_PHOTO_URL =
  "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=1120&h=680&fit=crop&q=85&fm=jpg";

const DAISY_BRAND_ICON_CID = "daisy-icon@daisy";
const GRAB_CAR_ICON_CID = "grab-icon@daisy";

// 64x64 @2x retina PNG of `public/brand/daisy-icon-light.svg` (5-petal Daisy mark on #e00b41)
const DAISY_BRAND_ICON_PNG_BASE64 =
  "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";

// 28x28 @2x retina PNG of the white Grab car icon
const GRAB_CAR_ICON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAAACXBIWXMAAAsTAAALEwEAmpwYAAABKUlEQVRIx+2WPw/BQBiH6cTQRIwSBl+iC5tJUomRjcHX8Xf0CWw0YUTUhKWfoY3dhJDzXvIOl+ba3vVKRPySZ6n39z7JiatU6p+fDiFEB8qS6HFEJWBD4mcNFEVlaeBE1HOku0SEFSzcASPG6RjYpamIFEY4vFT47le4Yxg1qAEeDncUhF3ccaY7wwarzHHmFYQ54BZ5rPDhGIccoKaIg7smQbI68CDJ5wk0ecKdb9AG9jEEvJ7NE7rMQJ95PpCQBfVcntBjBkzmuSkhDOp5UcI5kEEWEsKgXqSQ5oLIhtcTEiaZ7xBu3yjc8IT05TkFLM5rZibI0de1cGc57Hor+Eo9iTu05+sWREpZ4Mr7bQl0G0yP7siKFtvAAW8LTUKoYYd2W/9/hR/JC0xIYXnvpFh1AAAAAElFTkSuQmCC";

function buildInlineEmailIconAttachments(
  includeGrabIcon: boolean,
): SmtpMailAttachment[] {
  const attachments: SmtpMailAttachment[] = [
    {
      filename: "daisy-icon.png",
      content: Buffer.from(DAISY_BRAND_ICON_PNG_BASE64, "base64"),
      contentType: "image/png",
      cid: DAISY_BRAND_ICON_CID,
      contentDisposition: "inline",
    },
  ];
  if (includeGrabIcon) {
    attachments.push({
      filename: "grab-icon.png",
      content: Buffer.from(GRAB_CAR_ICON_PNG_BASE64, "base64"),
      contentType: "image/png",
      cid: GRAB_CAR_ICON_CID,
      contentDisposition: "inline",
    });
  }
  return attachments;
}

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  timeZone: "UTC",
});

function formatWeekdayFromManilaDate(dateManila: string): string {
  const instant = new Date(`${dateManila}T12:00:00Z`);
  if (Number.isNaN(instant.getTime())) return "";
  return weekdayFormatter.format(instant);
}

function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatFromHeader(fromEmail: string, fromName?: string | null): string {
  const cleanEmail = fromEmail.trim();
  const cleanName = fromName?.trim().replace(/[\r\n"]/g, "") ?? "";
  if (!cleanName) return cleanEmail;
  return `"${cleanName}" <${cleanEmail}>`;
}

function defaultSmtpTransportFactory(
  config: SmtpTransportConfig,
): SmtpMailSender {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 12_000,
  });
}

export function resolveEnvSmtpConfig(
  env: Record<string, string | undefined> = process.env,
): SmtpTransportConfig | null {
  const host = env.SMTP_HOST?.trim() ?? "";
  const user = env.SMTP_USER?.trim() ?? "";
  const pass = env.SMTP_PASS?.trim() ?? "";
  const rawPort = env.SMTP_PORT?.trim() ?? "";
  const port = rawPort ? Number(rawPort) : 587;
  const secure =
    env.SMTP_SECURE?.trim().toLowerCase() === "true" || port === 465;
  const fromEmail = env.MAIL_FROM?.trim() || user;

  if (
    !host ||
    !user ||
    !pass ||
    !fromEmail ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return null;
  }

  return {
    host,
    port,
    secure,
    user,
    pass,
    fromEmail,
  };
}

/**
 * Resolves the Owner's configured SMTP settings from PostgreSQL (decrypting the
 * stored app password) and falls back to optional environment SMTP variables.
 */
export async function resolveOwnerSmtpConfig(
  ownerUserId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<SmtpTransportConfig | null> {
  const row = await getDatabase().businessSettings.findUnique({
    where: { ownerUserId },
    select: {
      businessName: true,
      smtpEnabled: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPassEncrypted: true,
      smtpFromName: true,
      smtpFromEmail: true,
    },
  });

  if (row && row.smtpEnabled && row.smtpUser?.trim() && row.smtpPassEncrypted) {
    const pass = decryptAppSecret(row.smtpPassEncrypted, env);
    const user = row.smtpUser.trim();
    return {
      host: row.smtpHost?.trim() || "smtp.gmail.com",
      port: row.smtpPort ?? 587,
      secure: row.smtpSecure,
      user,
      pass,
      fromName: row.smtpFromName?.trim() || row.businessName.trim() || null,
      fromEmail: row.smtpFromEmail?.trim() || user,
    };
  }

  return resolveEnvSmtpConfig(env);
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
  const checkInWeekday = formatWeekdayFromManilaDate(input.checkInDateManila);
  const checkOutWeekday = formatWeekdayFromManilaDate(input.checkOutDateManila);
  const nightsLabel = `${input.nights} ${input.nights === 1 ? "night" : "nights"}`;
  const guestsLabel = `${input.partySize} ${input.partySize === 1 ? "guest" : "guests"}`;
  const rateFormatted = formatPhpCurrency(input.dailyRate);
  const totalFormatted = formatPhpCurrency(input.totalAmount);
  const safePhotoUrl =
    input.roomPhotoUrl && /^https?:\/\//i.test(input.roomPhotoUrl.trim())
      ? input.roomPhotoUrl.trim()
      : null;
  const mapsUrl = buildMapDirectionsUrl({
    address: input.propertyAddress,
    latitude: input.propertyLatitude,
    longitude: input.propertyLongitude,
  });
  const grabUrl = buildGrabBookingUrl({
    address: input.propertyAddress,
    latitude: input.propertyLatitude,
    longitude: input.propertyLongitude,
    propertyName: input.propertyName,
  });
  const preheader = `Confirmed ${input.referenceCode}, ${input.roomTitle}, ${checkInDisplay} to ${checkOutDisplay}, ${totalFormatted}`;

  const subject = `Booking confirmed (${input.referenceCode}) — ${input.propertyName}`;

  const textLines = [
    `Hi ${input.guestName},`,
    "",
    `Your reservation at ${input.propertyName} is confirmed.`,
    "",
    `Booking reference: ${input.referenceCode}`,
    `Room: ${input.roomTitle} (${input.scopeLabel})`,
    `Check-in: ${checkInWeekday ? `${checkInWeekday}, ` : ""}${checkInDisplay}${input.checkInTimeLabel ? ` (after ${input.checkInTimeLabel})` : ""}`,
    `Check-out: ${checkOutWeekday ? `${checkOutWeekday}, ` : ""}${checkOutDisplay}${input.checkOutTimeLabel ? ` (before ${input.checkOutTimeLabel})` : ""}`,
    `Length of stay: ${nightsLabel}`,
    `Guests: ${guestsLabel}`,
    `Nightly rate: ${rateFormatted}`,
    `Confirmed total: ${totalFormatted}`,
    "",
    input.propertyAddress ? `Location: ${input.propertyAddress}` : null,
    mapsUrl ? `Directions: ${mapsUrl}` : null,
    grabUrl ? `Book Grab: ${grabUrl}` : null,
    input.contactPhone ? `Front desk: ${input.contactPhone}` : null,
    `Track your booking status anytime: ${input.trackUrl}`,
    "",
    `Thank you,`,
    input.propertyName,
  ].filter((line): line is string => line !== null);

  const heroPhotoRow = safePhotoUrl
    ? `<tr>
        <td style="padding:0 28px 20px;">
          <img src="${escapeHtml(safePhotoUrl)}" alt="${escapeHtml(input.roomTitle)}" width="544" style="display:block;width:100%;max-width:544px;height:auto;border-radius:12px;border:1px solid #ececec;" />
        </td>
      </tr>`
    : "";

  const addressDisplay = input.propertyAddress?.trim() || null;

  const addressRow =
    addressDisplay || mapsUrl || grabUrl
      ? `<tr>
        <td style="padding:18px 0;border-bottom:1px solid #ebebeb;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td valign="top" style="padding-right:12px;">
                <div style="font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#6a6a6a;">Address</div>
                <div style="margin-top:5px;font-size:14px;line-height:1.5;color:#222222;">${escapeHtml(addressDisplay ?? input.propertyName)}</div>
              </td>
              ${
                mapsUrl || grabUrl
                  ? `<td valign="top" align="right" style="white-space:nowrap;">
                ${
                  mapsUrl
                    ? `<div><a href="${escapeHtml(mapsUrl)}" style="font-size:13px;font-weight:600;color:#e00b41;text-decoration:none;">Get directions &rarr;</a></div>`
                    : ""
                }
                ${
                  grabUrl
                    ? `<div style="margin-top:${mapsUrl ? "8px" : "0"};"><a href="${escapeHtml(grabUrl)}" style="display:inline-block;padding:6px 12px;background:#00b14f;border-radius:8px;font-size:12px;font-weight:700;color:#ffffff;text-decoration:none;line-height:16px;"><img src="cid:${GRAB_CAR_ICON_CID}" alt="" width="14" height="14" style="vertical-align:-2px;margin-right:6px;display:inline-block;border:0;" />Book Grab</a></div>`
                    : ""
                }
              </td>`
                  : ""
              }
            </tr>
          </table>
        </td>
      </tr>`
      : "";

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f7f7f7;color:#222222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f7;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e4e4e4;border-radius:16px;overflow:hidden;">
            <!-- Brand Top Bar -->
            <tr>
              <td style="padding:22px 28px 18px;border-bottom:1px solid #f0f0f0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="middle">
                      <table role="presentation" cellspacing="0" cellpadding="0">
                        <tr>
                          <td valign="middle" style="width:32px;height:32px;">
                            <img src="cid:${DAISY_BRAND_ICON_CID}" alt="${escapeHtml(input.propertyName)}" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:8px;border:0;" />
                          </td>
                          <td valign="middle" style="padding-left:10px;font-size:16px;font-weight:700;letter-spacing:-0.01em;color:#222222;">${escapeHtml(input.propertyName)}</td>
                        </tr>
                      </table>
                    </td>
                    <td valign="middle" align="right">
                      <span style="display:inline-block;padding:5px 11px;background:#eaf5ee;border:1px solid #b8dac4;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#1f6440;">Confirmed</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Editorial Headline -->
            <tr>
              <td style="padding:26px 28px 20px;">
                <p style="margin:0 0 6px;font-size:14px;color:#6a6a6a;">Hi ${escapeHtml(input.guestName)},</p>
                <h1 style="margin:0;font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:#222222;">Your reservation is confirmed</h1>
                <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#6a6a6a;">Your stay at ${escapeHtml(input.propertyName)} is all set. We look forward to welcoming you.</p>
              </td>
            </tr>

            <!-- Full-Width Hero Room Photo -->
            ${heroPhotoRow}

            <!-- Room Title & Host -->
            <tr>
              <td style="padding:0 28px 18px;">
                <div style="font-size:18px;line-height:1.3;font-weight:700;color:#222222;">${escapeHtml(input.roomTitle)}</div>
                <div style="margin-top:4px;font-size:13px;color:#6a6a6a;">${escapeHtml(input.scopeLabel)}</div>
                <div style="margin-top:2px;font-size:13px;color:#6a6a6a;">Hosted by ${escapeHtml(input.propertyName)}</div>
              </td>
            </tr>

            <!-- Side-by-Side Check-In / Check-Out Split -->
            <tr>
              <td style="padding:0 28px 22px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #ebebeb;border-bottom:1px solid #ebebeb;">
                  <tr>
                    <td width="50%" valign="top" style="padding:18px 14px 18px 0;border-right:1px solid #ebebeb;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6a6a6a;">Check-in</div>
                      ${checkInWeekday ? `<div style="margin-top:6px;font-size:13px;color:#6a6a6a;">${escapeHtml(checkInWeekday)}</div>` : ""}
                      <div style="margin-top:2px;font-size:16px;font-weight:700;color:#222222;">${escapeHtml(checkInDisplay)}</div>
                      ${input.checkInTimeLabel ? `<div style="margin-top:4px;font-size:12px;color:#6a6a6a;">After ${escapeHtml(input.checkInTimeLabel)}</div>` : ""}
                    </td>
                    <td width="50%" valign="top" align="right" style="padding:18px 0 18px 14px;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6a6a6a;">Check-out</div>
                      ${checkOutWeekday ? `<div style="margin-top:6px;font-size:13px;color:#6a6a6a;">${escapeHtml(checkOutWeekday)}</div>` : ""}
                      <div style="margin-top:2px;font-size:16px;font-weight:700;color:#222222;">${escapeHtml(checkOutDisplay)}</div>
                      ${input.checkOutTimeLabel ? `<div style="margin-top:4px;font-size:12px;color:#6a6a6a;">Before ${escapeHtml(input.checkOutTimeLabel)}</div>` : ""}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Full-Width Primary CTA -->
            <tr>
              <td style="padding:0 28px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="background:#e00b41;border-radius:10px;">
                      <a href="${escapeHtml(input.trackUrl)}" style="display:block;padding:14px 20px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;text-align:center;">Track booking status</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Clean Hairline Detail Rows -->
            <tr>
              <td style="padding:0 28px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #ebebeb;">
                  ${addressRow}
                  <tr>
                    <td style="padding:16px 0;border-bottom:1px solid #ebebeb;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="font-size:13px;color:#6a6a6a;">Stay &amp; guests</td>
                          <td align="right" style="font-size:14px;font-weight:600;color:#222222;">${escapeHtml(nightsLabel)}, ${escapeHtml(guestsLabel)}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 0;border-bottom:1px solid #ebebeb;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="font-size:13px;color:#6a6a6a;">Rate</td>
                          <td align="right" style="font-size:14px;color:#222222;">${escapeHtml(rateFormatted)} &times; ${escapeHtml(nightsLabel)}</td>
                        </tr>
                        <tr>
                          <td style="padding-top:10px;font-size:15px;font-weight:700;color:#222222;">Confirmed total</td>
                          <td align="right" style="padding-top:10px;font-size:18px;font-weight:700;color:#222222;">${escapeHtml(totalFormatted)}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 0 22px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="font-size:13px;color:#6a6a6a;">Booking reference</td>
                          <td align="right" style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;font-weight:700;color:#222222;">${escapeHtml(input.referenceCode)}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Hospitality Utility Strip -->
            <tr>
              <td style="padding:20px 28px;background:#f7f7f7;border-top:1px solid #ebebeb;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="33%" valign="top" align="center" style="padding:0 6px;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#222222;">Valid ID</div>
                      <div style="margin-top:4px;font-size:12px;line-height:1.4;color:#6a6a6a;">Present a valid ID at check-in</div>
                    </td>
                    <td width="33%" valign="top" align="center" style="padding:0 6px;border-left:1px solid #e4e4e4;border-right:1px solid #e4e4e4;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#222222;">Front Desk</div>
                      <div style="margin-top:4px;font-size:12px;line-height:1.4;color:#6a6a6a;">${input.contactPhone ? escapeHtml(input.contactPhone) : "Reply to this email"}</div>
                    </td>
                    <td width="33%" valign="top" align="center" style="padding:0 6px;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#222222;">Live Status</div>
                      <div style="margin-top:4px;font-size:12px;line-height:1.4;color:#6a6a6a;">Track anytime online</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Quiet Footer -->
            <tr>
              <td align="center" style="padding:18px 28px;background:#ffffff;border-top:1px solid #f0f0f0;font-size:12px;line-height:1.5;color:#6a6a6a;">
                <div style="font-weight:600;color:#222222;">${escapeHtml(input.propertyName)}</div>
                ${input.propertyAddress ? `<div style="margin-top:2px;">${escapeHtml(input.propertyAddress)}</div>` : ""}
                <div style="margin-top:8px;font-size:11px;color:#8c8c8c;">Sent automatically upon host approval.</div>
              </td>
            </tr>
          </table>
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

async function sendViaSmtpSafe(params: {
  config: SmtpTransportConfig;
  toEmail: string;
  subject: string;
  text: string;
  html: string;
  transportFactory?: SmtpTransportFactory | undefined;
}): Promise<BookingEmailSendOutcome> {
  const factory = params.transportFactory ?? defaultSmtpTransportFactory;
  const transport = factory(params.config);
  const includeGrabIcon = params.html.includes(`cid:${GRAB_CAR_ICON_CID}`);
  try {
    const info = await transport.sendMail({
      from: formatFromHeader(params.config.fromEmail, params.config.fromName),
      to: params.toEmail,
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments: buildInlineEmailIconAttachments(includeGrabIcon),
    });
    const messageId =
      typeof info?.messageId === "string" && info.messageId.trim()
        ? info.messageId.trim()
        : null;
    return { status: "sent", messageId };
  } catch {
    return {
      status: "failed",
      reason:
        "Could not send email via your mail server. Check your SMTP host, port, and app password in Settings.",
    };
  } finally {
    transport.close?.();
  }
}

/**
 * Transactional booking confirmation mailer using Nodemailer SMTP.
 * Runs outside database transactions and never throws or logs secrets/PII.
 */
export async function sendBookingApprovedEmailSafe(
  input: BookingApprovedEmailInput,
  options: {
    smtpConfig?: SmtpTransportConfig | null | undefined;
    ownerUserId?: string | undefined;
    transportFactory?: SmtpTransportFactory | undefined;
  } = {},
): Promise<BookingEmailSendOutcome> {
  const toEmail = input.toEmail.trim().toLowerCase();
  if (!toEmail || !EMAIL_PATTERN.test(toEmail)) {
    return { status: "skipped", reason: "Guest email address is missing." };
  }

  let config: SmtpTransportConfig | null = null;
  if (options.smtpConfig !== undefined) {
    config = options.smtpConfig;
  } else if (options.ownerUserId) {
    try {
      config = await resolveOwnerSmtpConfig(options.ownerUserId);
    } catch {
      return {
        status: "failed",
        reason:
          "Stored email password could not be read. Re-enter it in Settings.",
      };
    }
  } else {
    config = resolveEnvSmtpConfig();
  }

  if (!config) {
    return {
      status: "skipped",
      reason: "Email delivery is not configured yet.",
    };
  }

  const content = buildBookingApprovedEmailContent(input);
  return sendViaSmtpSafe({
    config: {
      ...config,
      fromName: config.fromName || input.propertyName,
    },
    toEmail,
    subject: content.subject,
    text: content.text,
    html: content.html,
    transportFactory: options.transportFactory,
  });
}

/**
 * Sends a sample preview of the booking confirmation email template using the
 * Owner's configured SMTP settings so they can verify delivery and layout.
 */
export async function sendTestSmtpEmailSafe(params: {
  toEmail: string;
  propertyName: string;
  propertyAddress?: string | null | undefined;
  propertyLatitude?: number | null | undefined;
  propertyLongitude?: number | null | undefined;
  contactPhone?: string | null | undefined;
  checkInTimeLabel?: string | undefined;
  checkOutTimeLabel?: string | undefined;
  trackUrl?: string | undefined;
  smtpConfig: SmtpTransportConfig;
  transportFactory?: SmtpTransportFactory | undefined;
}): Promise<BookingEmailSendOutcome> {
  const toEmail = params.toEmail.trim().toLowerCase();
  if (!toEmail || !EMAIL_PATTERN.test(toEmail)) {
    return { status: "failed", reason: "Enter a valid recipient email." };
  }

  const propName = params.propertyName.trim() || "Daisy Residences";
  const appOrigin =
    process.env.APP_ORIGIN?.trim().replace(/\/+$/, "") ||
    "http://localhost:3000";
  const todayManila = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const checkOutDate = new Date(`${todayManila}T00:00:00Z`);
  checkOutDate.setUTCDate(checkOutDate.getUTCDate() + 2);
  const checkOutManila = checkOutDate.toISOString().slice(0, 10);

  const preview = buildBookingApprovedEmailContent({
    toEmail,
    guestName: "Sample Guest",
    referenceCode: "REQ-SAMPLE0001",
    propertyName: propName,
    propertyAddress: params.propertyAddress ?? null,
    propertyLatitude: params.propertyLatitude ?? null,
    propertyLongitude: params.propertyLongitude ?? null,
    contactPhone: params.contactPhone ?? null,
    roomTitle: "Room 202 — Courtyard Studio Suite",
    scopeLabel: "Private room",
    roomPhotoUrl: SAMPLE_PREVIEW_ROOM_PHOTO_URL,
    checkInDateManila: todayManila,
    checkOutDateManila: checkOutManila,
    checkInTimeLabel: params.checkInTimeLabel ?? "2:00 PM",
    checkOutTimeLabel: params.checkOutTimeLabel ?? "12:00 PM",
    nights: 2,
    partySize: 2,
    dailyRate: "1250.00",
    totalAmount: "2500.00",
    trackUrl: params.trackUrl ?? `${appOrigin}/book#track`,
  });

  const subject = `[Test] ${preview.subject}`;
  const text = `[TEST EMAIL — Sample booking confirmation preview]\n\n${preview.text}`;
  const html = preview.html.replace(
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;',
    '<div style="max-width:600px;margin:0 auto 12px;padding:10px 16px;background:#fff4d6;border:1px solid #ead28e;border-radius:10px;font-size:12px;line-height:1.4;color:#7a5209;text-align:center;"><strong>Test email preview</strong> — Your Gmail connection is working. This is a sample of the booking confirmation email guests receive.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;',
  );

  return sendViaSmtpSafe({
    config: {
      ...params.smtpConfig,
      fromName: params.smtpConfig.fromName || propName,
    },
    toEmail,
    subject,
    text,
    html,
    transportFactory: params.transportFactory,
  });
}
