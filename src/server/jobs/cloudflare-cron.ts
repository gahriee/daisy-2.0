export const BILLING_GENERATE_CRON = "15 16 * * *";
export const MAINTENANCE_CLEANUP_CRON = "45 18 * * *";

export type ScheduledJobEndpoint =
  "/api/jobs/billing/generate" | "/api/jobs/maintenance/cleanup";

const CRON_ENDPOINT_MAP: Record<string, ScheduledJobEndpoint> = {
  [BILLING_GENERATE_CRON]: "/api/jobs/billing/generate",
  [MAINTENANCE_CLEANUP_CRON]: "/api/jobs/maintenance/cleanup",
};

export type CronDispatchEnv = {
  APP_ORIGIN?: string;
  CRON_SECRET?: string;
};

export function resolveScheduledJobPath(
  cron: string,
): ScheduledJobEndpoint | null {
  return CRON_ENDPOINT_MAP[cron.trim()] ?? null;
}

function resolveInternalOrigin(appOrigin: string | undefined): string {
  const trimmed = appOrigin?.trim();
  if (trimmed && URL.canParse(trimmed)) {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.origin;
    }
  }
  return "https://daisy.internal";
}

/**
 * Dispatches a Cloudflare Cron Trigger directly to the matching authenticated
 * scheduled job Route Handler without leaking credentials in errors or logs.
 */
export async function dispatchScheduledCron(params: {
  cron: string;
  env: CronDispatchEnv;
  fetcher: (request: Request) => Promise<Response>;
}): Promise<{ endpoint: ScheduledJobEndpoint; status: number }> {
  const endpoint = resolveScheduledJobPath(params.cron);
  if (!endpoint) {
    throw new Error(`Unsupported cron schedule: ${params.cron}`);
  }

  const cronSecret = params.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    throw new Error("Scheduled job authentication secret is not configured.");
  }

  const origin = resolveInternalOrigin(params.env.APP_ORIGIN);
  const request = new Request(`${origin}${endpoint}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cronSecret}`,
      "content-type": "application/json",
      origin,
    },
    body: "{}",
  });

  const response = await params.fetcher(request);
  if (!response.ok) {
    throw new Error(
      `Scheduled job ${endpoint} failed with HTTP ${response.status}.`,
    );
  }

  return { endpoint, status: response.status };
}
