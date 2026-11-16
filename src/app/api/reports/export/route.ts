import { exportReportCsv } from "@/features/reports/service";
import { requireOwnerUserId } from "@/server/auth/owner";
import {
  errorToResponse,
  PRIVATE_RESPONSE_HEADERS,
} from "@/server/http/route-helpers";

/**
 * Generates and downloads a bounded CSV attachment for one operational report.
 * Records an identifier-only `report.exported` audit entry before returning CSV bytes.
 */
export async function GET(request: Request) {
  try {
    const ownerUserId = await requireOwnerUserId();
    const { searchParams } = new URL(request.url);

    const result = await exportReportCsv(
      ownerUserId,
      searchParams.get("reportType") ?? undefined,
      {
        asOfDate: searchParams.get("asOfDate") ?? undefined,
        fromDate: searchParams.get("fromDate") ?? undefined,
        toDate: searchParams.get("toDate") ?? undefined,
        building: searchParams.get("building") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
      },
    );

    const headers = new Headers(PRIVATE_RESPONSE_HEADERS);
    headers.set("Content-Type", "text/csv; charset=utf-8");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(result.csv, {
      status: 200,
      headers,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
