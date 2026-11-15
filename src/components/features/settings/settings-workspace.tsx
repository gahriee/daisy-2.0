import type { BusinessSettingsDto } from "@/features/settings/schemas";
import {
  BusinessSettingsForm,
  type SettingsSectionKey,
} from "./business-settings-form";
import {
  DeviceManagementPanel,
  type ClientDeviceSummary,
} from "./device-management-panel";

const SECTION_HEADERS: Record<
  SettingsSectionKey,
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
      "Standard check-in/out schedule, offline unlock window, and attachment size limits.",
  },
  devices: {
    title: "Trusted devices",
    description:
      "Authorized Owner browsers allowed to sync records and upload payment proofs offline.",
  },
};

export function SettingsWorkspace({
  section,
  initialSettings,
  initialDevices = [],
}: {
  section: SettingsSectionKey;
  initialSettings?: BusinessSettingsDto;
  initialDevices?: ClientDeviceSummary[];
}) {
  const activeHeader = SECTION_HEADERS[section];

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

      {section === "devices" ? (
        <DeviceManagementPanel initialDevices={initialDevices} />
      ) : (
        initialSettings && (
          <BusinessSettingsForm
            initialSettings={initialSettings}
            activeSection={section}
          />
        )
      )}
    </div>
  );
}
