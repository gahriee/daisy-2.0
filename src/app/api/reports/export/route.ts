import { exportReport } from "@/features/reports/service";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  errorToResponse,
  PRIVATE_RESPONSE_HEADERS,
} from "@/server/http/route-helpers";

/**
 * Generates and downloads a bounded operational report attachment in CSV, Excel
 * (`.xlsx`), Word (`.docx`), or PDF (`.pdf`) using Daisy's shared report template.
 * Records an identifier-only `report.exported` audit entry before returning bytes.
 */
export async function GET(request: Request) {
  try {
    const ownerUserId = await requireOwnerUserId();
    const { searchParams } = new URL(request.url);

    const result = await exportReport(
      ownerUserId,
      searchParams.get("reportType") ?? undefined,
      searchParams.get("format") ?? undefined,
      {
        asOfDate: searchParams.get("asOfDate") ?? undefined,
        fromDate: searchParams.get("fromDate") ?? undefined,
        toDate: searchParams.get("toDate") ?? undefined,
        building: searchParams.get("building") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
      },
    );

    const headers = new Headers(PRIVATE_RESPONSE_HEADERS);
    headers.set("Content-Type", result.contentType);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    headers.set("X-Content-Type-Options", "nosniff");

    const body = new Uint8Array(result.bytes);
    return new Response(body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
