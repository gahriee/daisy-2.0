import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuditLogExplorer } from "@/components/features/audit/audit-log-explorer";
import { AUDIT_AREAS } from "@/features/audit/schemas";
import { listAuditLogs } from "@/features/audit/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function pickSingleParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: SearchParamsInput;
}) {
  await connection();
  let authenticated = false;
  try {
    authenticated = await isOwner();
  } catch {
    authenticated = false;
  }

  const ownerUserId = process.env.OWNER_USER_ID;
  if (!authenticated || !ownerUserId) {
    redirect("/auth/sign-in");
  }

  const rawParams = await searchParams;
  const areaParam = pickSingleParam(rawParams.area);
  const queryParam = pickSingleParam(rawParams.query);
  const actionParam = pickSingleParam(rawParams.action);
  const fromParam = pickSingleParam(rawParams.fromDate);
  const toParam = pickSingleParam(rawParams.toDate);

  const area = AUDIT_AREAS.includes(areaParam as (typeof AUDIT_AREAS)[number])
    ? (areaParam as (typeof AUDIT_AREAS)[number])
    : "all";

  const { entries, filters } = await listAuditLogs(ownerUserId, {
    area,
    query: queryParam || undefined,
    action: actionParam || undefined,
    fromDate: fromParam || undefined,
    toDate: toParam || undefined,
    limit: 50,
  });

  return <AuditLogExplorer initialEntries={entries} initialFilters={filters} />;
}
