"use client";

import { useSearchParams } from "next/navigation";
import type { BusinessSettingsDto } from "@/features/settings/schemas";
import {
  BusinessSettingsForm,
  type SettingsTabKey,
} from "./business-settings-form";
import {
  DeviceManagementPanel,
  type ClientDeviceSummary,
} from "./device-management-panel";

const VALID_TABS: readonly SettingsTabKey[] = [
  "profile",
  "policies",
  "operations",
  "devices",
];

const SECTION_HEADERS: Record<
  SettingsTabKey,
  { title: string; description: string }
> = {
  profile: {
    title: "Property profile",
    description:
      "Boarding house identity, contact details, and optional TIN printed on invoices and tenant notices.",
  },
  policies: {
    title: "Billing & policies",
    description:
      "Explicit Owner rules for monthly rent runs, grace periods, proration, deposits, and document prefixes.",
  },
  operations: {
    title: "Stays & limits",
    description:
      "Standard Asia/Manila check-in/out schedule, offline unlock window, and attachment size limits.",
  },
  devices: {
    title: "Trusted devices",
    description:
      "Authorized Owner browsers allowed to sync records and upload payment proofs offline.",
  },
};

function resolveTab(
  raw: string | null | undefined,
  fallback: SettingsTabKey,
): SettingsTabKey {
  return VALID_TABS.includes(raw as SettingsTabKey)
    ? (raw as SettingsTabKey)
    : fallback;
}

export function SettingsWorkspace({
  initialSettings,
  initialDevices,
  initialTab = "profile",
}: {
  initialSettings: BusinessSettingsDto;
  initialDevices: ClientDeviceSummary[];
  initialTab?: SettingsTabKey;
}) {
  const searchParams = useSearchParams();
  const activeTab = resolveTab(searchParams.get("tab"), initialTab);
  const activeHeader = SECTION_HEADERS[activeTab];

  function selectSection(nextSection: SettingsTabKey) {
    try {
      window.history.replaceState(null, "", `/settings?tab=${nextSection}`);
    } catch {
      // Ignore restricted history updates.
    }
  }

  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <h1
          id="settings-heading"
          className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
        >
          {activeHeader.title}
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          {activeHeader.description}
        </p>
      </header>

      <BusinessSettingsForm
        initialSettings={initialSettings}
        activeTab={activeTab}
        onSelectTab={selectSection}
      />

      {activeTab === "devices" && (
        <DeviceManagementPanel initialDevices={initialDevices} />
      )}
    </div>
  );
}
