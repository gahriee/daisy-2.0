"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DaisyLogoLoader } from "@/components/common/daisy-logo-loader";
import { BillingWorkspace } from "@/components/features/billing/billing-workspace";
import { DashboardWorkspace } from "@/components/features/dashboard/dashboard-workspace";
import { MaintenanceCreateForm } from "@/components/features/maintenance/maintenance-create-form";
import { MaintenanceDetailView } from "@/components/features/maintenance/maintenance-detail-view";
import { MaintenanceWorkspace } from "@/components/features/maintenance/maintenance-workspace";
import { NoticesWorkspace } from "@/components/features/notices/notices-workspace";
import { PaymentCreateForm } from "@/components/features/payments/payment-create-form";
import { PaymentsWorkspace } from "@/components/features/payments/payments-workspace";
import { RoomsWorkspace } from "@/components/features/rooms/rooms-workspace";
import { TenantsWorkspace } from "@/components/features/tenants/tenants-workspace";
import {
  TransientsWorkspace,
  type TransientWorkspaceSection,
} from "@/components/features/transients/transients-workspace";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BillingOverviewDto } from "@/features/billing/schemas";
import type { DashboardSnapshotDto } from "@/features/dashboard/schemas";
import type {
  MaintenanceDetailDto,
  MaintenanceOverviewDto,
} from "@/features/maintenance/schemas";
import type { NoticeOverviewDto } from "@/features/notices/schemas";
import type { PaymentsOverviewDto } from "@/features/payments/schemas";
import type {
  InventoryOverviewDto,
  RoomBuildingValue,
} from "@/features/rooms/schemas";
import type { TenantsOverviewDto } from "@/features/tenants/schemas";
import type { TransientsOverviewDto } from "@/features/transients/schemas";
import {
  ensureTrustedDeviceVaultUnlocked,
  getBrowserOfflineDb,
  getVaultCustody,
} from "@/offline/client";
import {
  loadMaintenanceDetailFromVault,
  loadMaintenanceOverviewFromVault,
  loadPaymentsOverviewFromVault,
  loadTenantsOverviewFromVault,
  type OfflineEntitySyncBadge,
} from "@/offline/snapshot-selectors";
import {
  loadBillingOverviewFromVault,
  loadDashboardSnapshotFromVault,
  loadNoticesOverviewFromVault,
  loadRoomsOverviewFromVault,
  loadTransientsOverviewFromVault,
} from "@/offline/snapshot-selectors-extra";
import {
  attachOfflineShellLinkInterceptor,
  getOfflinePathname,
  subscribeOfflineLocation,
} from "@/offline/navigation";
import { DAISY_OFFLINE_VAULT_EVENT } from "@/offline/workspace-bridge";
import { OfflineVaultUnlockCard } from "./offline-vault-unlock";
import { OfflineVaultWorkspace } from "./offline-vault-workspace";

function resolveTransientOfflineSection(): TransientWorkspaceSection {
  return "stays";
}

function resolveOfflineShellTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/tenants")) return "Tenants";
  if (pathname.startsWith("/transients/rooms")) return "Transient rooms";
  if (pathname.startsWith("/transients")) return "Stays & requests";
  if (pathname.startsWith("/payments/new")) return "Record payment";
  if (pathname.startsWith("/payments")) return "Payments";
  if (pathname.startsWith("/maintenance/new")) return "Log maintenance";
  if (pathname.startsWith("/maintenance")) return "Maintenance";
  if (pathname.startsWith("/rooms")) return "Boarding Rooms";
  if (pathname.startsWith("/billing")) return "Billing";
  if (pathname.startsWith("/notices")) return "Notices";
  return "Offline copy";
}

type OfflineRouteData =
  | {
      kind: "dashboard";
      snapshot: DashboardSnapshotDto;
      lastSyncedAt: string | null;
    }
  | {
      kind: "tenants";
      overview: TenantsOverviewDto;
      syncBadges: Record<string, OfflineEntitySyncBadge>;
      lastSyncedAt: string | null;
    }
  | {
      kind: "transients";
      section: TransientWorkspaceSection;
      overview: TransientsOverviewDto;
      syncBadges: Record<string, OfflineEntitySyncBadge>;
      lastSyncedAt: string | null;
    }
  | {
      kind: "payments";
      overview: PaymentsOverviewDto;
      syncBadges: Record<string, OfflineEntitySyncBadge>;
      lastSyncedAt: string | null;
    }
  | {
      kind: "maintenance";
      overview: MaintenanceOverviewDto;
      syncBadges: Record<string, OfflineEntitySyncBadge>;
      lastSyncedAt: string | null;
    }
  | {
      kind: "maintenance_detail";
      requestId: string;
      detail: MaintenanceDetailDto | null;
      syncBadge: OfflineEntitySyncBadge | undefined;
      lastSyncedAt: string | null;
    }
  | {
      kind: "rooms";
      building: RoomBuildingValue;
      overview: InventoryOverviewDto;
      lastSyncedAt: string | null;
    }
  | {
      kind: "billing";
      overview: BillingOverviewDto;
      lastSyncedAt: string | null;
    }
  | {
      kind: "notices";
      overview: NoticeOverviewDto;
      lastSyncedAt: string | null;
    }
  | { kind: "unsupported" };

function isSupportedOfflineDomainRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/tenants") return true;
  if (
    pathname === "/transients" ||
    pathname === "/transients/stays" ||
    pathname === "/transients/requests" ||
    pathname === "/transients/guests"
  ) {
    return true;
  }
  if (pathname === "/transients/rooms") return true;
  if (pathname === "/payments" || pathname === "/payments/new") return true;
  if (pathname.startsWith("/maintenance")) return true;
  if (pathname === "/rooms") return true;
  if (pathname === "/billing") return true;
  if (pathname === "/notices") return true;
  return false;
}

/**
 * PII-free Service Worker navigation fallback dispatcher.
 * Decrypts local snapshots only after passphrase unlock and renders shared
 * client domain workspaces right at their requested route.
 */
export function OfflineRouteFallback() {
  const routerPathname = usePathname() || "/offline";
  const browserPathname = useSyncExternalStore(
    subscribeOfflineLocation,
    () => getOfflinePathname("/offline"),
    () => "/offline",
  );
  const pathname =
    routerPathname === "/offline" && browserPathname !== "/offline"
      ? browserPathname
      : routerPathname;
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [loadedRoute, setLoadedRoute] = useState<{
    pathname: string;
    data: OfflineRouteData;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadSeqRef = useRef(0);

  const routeData =
    loadedRoute && loadedRoute.pathname === pathname ? loadedRoute.data : null;

  useEffect(() => {
    return attachOfflineShellLinkInterceptor();
  }, []);

  async function refreshFallbackView() {
    const requestSeq = ++loadSeqRef.current;
    const targetPathname = pathname;
    try {
      const db = getBrowserOfflineDb();
      const custody = getVaultCustody();
      if (!custody.isUnlocked()) {
        await ensureTrustedDeviceVaultUnlocked({
          db,
          custody,
          isOnline: navigator.onLine,
        });
      }
      const unlocked = custody.isUnlocked();
      if (loadSeqRef.current !== requestSeq) return;
      setVaultUnlocked(unlocked);
      setLoadError(null);

      if (!unlocked) {
        setLoadedRoute(null);
        return;
      }

      if (targetPathname === "/offline") {
        setLoadedRoute(null);
        return;
      }

      const key = custody.getKey();

      let nextData: OfflineRouteData = { kind: "unsupported" };

      if (targetPathname === "/") {
        const res = await loadDashboardSnapshotFromVault(db, key);
        nextData = { kind: "dashboard", ...res };
      } else if (targetPathname === "/tenants") {
        const res = await loadTenantsOverviewFromVault(db, key);
        nextData = { kind: "tenants", ...res };
      } else if (
        targetPathname === "/transients" ||
        targetPathname === "/transients/stays" ||
        targetPathname === "/transients/requests" ||
        targetPathname === "/transients/guests"
      ) {
        const res = await loadTransientsOverviewFromVault(db, key);
        nextData = {
          kind: "transients",
          section: resolveTransientOfflineSection(),
          ...res,
        };
      } else if (
        targetPathname === "/transients/rooms" ||
        targetPathname === "/rooms"
      ) {
        const building: RoomBuildingValue = targetPathname.startsWith(
          "/transients",
        )
          ? "TRANSIENT"
          : "BOARDING";
        const res = await loadRoomsOverviewFromVault(db, key, building);
        nextData = { kind: "rooms", building, ...res };
      } else if (targetPathname === "/billing") {
        const res = await loadBillingOverviewFromVault(db, key);
        nextData = { kind: "billing", ...res };
      } else if (targetPathname === "/notices") {
        const res = await loadNoticesOverviewFromVault(db, key);
        nextData = { kind: "notices", ...res };
      } else if (
        targetPathname === "/payments" ||
        targetPathname === "/payments/new"
      ) {
        const res = await loadPaymentsOverviewFromVault(db, key);
        nextData = { kind: "payments", ...res };
      } else if (
        targetPathname === "/maintenance" ||
        targetPathname === "/maintenance/new"
      ) {
        const res = await loadMaintenanceOverviewFromVault(db, key);
        nextData = { kind: "maintenance", ...res };
      } else if (targetPathname.startsWith("/maintenance/")) {
        const requestId =
          targetPathname.slice("/maintenance/".length).split("/")[0] ?? "";
        const res = await loadMaintenanceDetailFromVault(db, key, requestId);
        nextData = {
          kind: "maintenance_detail",
          requestId,
          detail: res.detail,
          syncBadge: res.syncBadge,
          lastSyncedAt: res.lastSyncedAt,
        };
      }

      if (loadSeqRef.current !== requestSeq) return;
      setLoadedRoute({ pathname: targetPathname, data: nextData });
    } catch (error) {
      if (loadSeqRef.current !== requestSeq) return;
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not open the offline copy.",
      );
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refreshFallbackView();
    }, 0);
    const onVaultChange = () => {
      void refreshFallbackView();
    };
    window.addEventListener(DAISY_OFFLINE_VAULT_EVENT, onVaultChange);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener(DAISY_OFFLINE_VAULT_EVENT, onVaultChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (pathname === "/offline") {
    return <OfflineVaultWorkspace />;
  }

  const title = resolveOfflineShellTitle(pathname);

  if (isSupportedOfflineDomainRoute(pathname)) {
    return (
      <WorkspaceShell title={title}>
        {loadError && (
          <Alert tone="danger" role="alert" className="mb-4">
            {loadError}
          </Alert>
        )}
        {!vaultUnlocked ? (
          <div className="grid gap-4">
            <Alert tone="warning" role="status">
              You are viewing the offline copy for {title}. Enter your offline
              password once to open saved records across all offline pages.
            </Alert>
            <OfflineVaultUnlockCard
              title={`Open saved ${title.toLowerCase()} records`}
              onUnlocked={refreshFallbackView}
            />
          </div>
        ) : !routeData ? (
          <Card className="py-12">
            <DaisyLogoLoader
              label={`Loading saved ${title.toLowerCase()} records…`}
            />
          </Card>
        ) : routeData.kind === "dashboard" ? (
          <DashboardWorkspace
            initialSnapshot={routeData.snapshot}
            offlineMode
            initialLastSyncedAt={routeData.lastSyncedAt}
          />
        ) : routeData.kind === "tenants" ? (
          <TenantsWorkspace
            initialOverview={routeData.overview}
            offlineMode
            initialLastSyncedAt={routeData.lastSyncedAt}
            initialSyncBadges={routeData.syncBadges}
          />
        ) : routeData.kind === "transients" ? (
          <TransientsWorkspace
            section={routeData.section}
            initialOverview={routeData.overview}
            offlineMode
            initialLastSyncedAt={routeData.lastSyncedAt}
            initialSyncBadges={routeData.syncBadges}
          />
        ) : routeData.kind === "rooms" ? (
          <RoomsWorkspace
            initialOverview={routeData.overview}
            building={routeData.building}
            offlineMode
            initialLastSyncedAt={routeData.lastSyncedAt}
          />
        ) : routeData.kind === "billing" ? (
          <BillingWorkspace
            initialOverview={routeData.overview}
            offlineMode
            initialLastSyncedAt={routeData.lastSyncedAt}
          />
        ) : routeData.kind === "notices" ? (
          <NoticesWorkspace
            initialOverview={routeData.overview}
            offlineMode
            initialLastSyncedAt={routeData.lastSyncedAt}
          />
        ) : routeData.kind === "payments" && pathname === "/payments/new" ? (
          <PaymentCreateForm
            tenants={routeData.overview.tenants}
            transientGuests={routeData.overview.transientGuests}
            openInvoices={routeData.overview.openInvoices}
            initialTenantId={null}
            initialInvoiceId={null}
            policiesComplete={routeData.overview.policiesComplete}
            missingPolicyLabels={routeData.overview.missingPolicyLabels}
            overpaymentPolicy={routeData.overview.overpaymentPolicy}
            proofMaxBytes={routeData.overview.proofMaxBytes}
            proofMaxFilesPerRecord={routeData.overview.proofMaxFilesPerRecord}
            offlineMode
          />
        ) : routeData.kind === "payments" ? (
          <PaymentsWorkspace
            initialOverview={routeData.overview}
            offlineMode
            initialLastSyncedAt={routeData.lastSyncedAt}
            initialSyncBadges={routeData.syncBadges}
          />
        ) : routeData.kind === "maintenance" &&
          pathname === "/maintenance/new" ? (
          <MaintenanceCreateForm
            rooms={routeData.overview.rooms}
            proofMaxMb={routeData.overview.proofMaxMb}
            proofMaxFilesPerRecord={routeData.overview.proofMaxFilesPerRecord}
            offlineMode
          />
        ) : routeData.kind === "maintenance" ? (
          <MaintenanceWorkspace
            initialOverview={routeData.overview}
            offlineMode
            initialLastSyncedAt={routeData.lastSyncedAt}
            initialSyncBadges={routeData.syncBadges}
          />
        ) : routeData.kind === "maintenance_detail" && routeData.detail ? (
          <MaintenanceDetailView
            request={routeData.detail.request}
            proofMaxMb={routeData.detail.proofMaxMb}
            proofMaxFilesPerRecord={routeData.detail.proofMaxFilesPerRecord}
            offlineMode
            {...(routeData.syncBadge ? { syncBadge: routeData.syncBadge } : {})}
            onRefreshVault={refreshFallbackView}
          />
        ) : (
          <Card className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              This item is not saved on this device yet. Tap Update now once you
              are back online.
            </p>
            <div>
              <Link
                href="/maintenance"
                className={buttonClasses({ variant: "secondary", size: "md" })}
              >
                Back to maintenance
              </Link>
            </div>
          </Card>
        )}
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell title={title}>
      <div className="grid gap-5">
        <Alert tone="warning" role="status">
          This page ({pathname}) is only available while online. Choose an
          offline page below or check pending items in Offline copy.
        </Alert>
        {!vaultUnlocked && (
          <OfflineVaultUnlockCard onUnlocked={refreshFallbackView} />
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Dashboard
          </Link>
          <Link
            href="/tenants"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Tenants
          </Link>
          <Link
            href="/transients/stays"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Stays &amp; reservations
          </Link>
          <Link
            href="/payments"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Payments
          </Link>
          <Link
            href="/maintenance"
            className={buttonClasses({ variant: "secondary", size: "md" })}
          >
            Maintenance
          </Link>
          <Link
            href="/offline"
            className={buttonClasses({ variant: "primary", size: "md" })}
          >
            Offline copy
          </Link>
        </div>
        {vaultUnlocked && <OfflineVaultWorkspace />}
      </div>
    </WorkspaceShell>
  );
}
