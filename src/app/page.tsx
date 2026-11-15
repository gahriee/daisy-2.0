import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

// Dashboard inspects fresh request authority and must not enter prerender caches.
export const instant = false;

const ledgerModules = [
  {
    index: "01",
    title: "Rooms and rates",
    description:
      "Track room availability, maintenance holds, and monthly or daily rates.",
  },
  {
    index: "02",
    title: "Tenants and transient stays",
    description:
      "Manage boarder assignments, short-stay reservations, and overlap-safe check-ins.",
  },
  {
    index: "03",
    title: "Invoices and payment proofs",
    description:
      "Issue Philippine peso billing statements, record collections, and store receipt photos.",
  },
] as const;

export default async function Home() {
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

  const profile = await getOwnerWorkspaceProfile(ownerUserId);

  return (
    <WorkspaceShell title="Dashboard" profile={profile}>
      <section aria-labelledby="overview-heading" className="grid gap-1.5">
        <h1
          id="overview-heading"
          className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        >
          Property overview
        </h1>
        <p className="max-w-prose text-base leading-6 text-muted-foreground">
          Daily workspace for boarding house rooms, transient stays, billing
          dates, and collections.
        </p>
      </section>

      <EmptyState aria-labelledby="empty-dashboard-title">
        <EmptyStateIcon>
          <svg
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20h14V9.5" />
            <path d="M9.5 20v-5.5h5V20" />
          </svg>
        </EmptyStateIcon>

        <div className="grid gap-2">
          <EmptyStateTitle id="empty-dashboard-title">
            No workspace records yet
          </EmptyStateTitle>
          <EmptyStateDescription>
            Occupancy counts, due invoices, and check-ins will populate here
            once operational modules are connected. Review Daisy’s component
            reference below.
          </EmptyStateDescription>
        </div>

        <EmptyStateActions>
          <Link
            href="/design-system"
            className={buttonClasses({ variant: "secondary" })}
          >
            View design system
          </Link>
        </EmptyStateActions>
      </EmptyState>

      <section aria-labelledby="planned-modules-heading" className="grid gap-4">
        <h2
          id="planned-modules-heading"
          className="text-base font-semibold tracking-tight text-foreground"
        >
          Scheduled operational ledgers
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {ledgerModules.map((item) => (
            <Card key={item.index} className="grid content-start gap-2.5">
              <span className="font-mono text-xs font-medium text-muted-foreground tabular-nums">
                {item.index}
              </span>
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {item.title}
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {item.description}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </WorkspaceShell>
  );
}
