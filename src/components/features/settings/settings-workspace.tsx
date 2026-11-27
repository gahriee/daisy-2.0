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
  property: {
    title: "Property & stay settings",
    description:
      "Your boarding house details, check-in and check-out times, and automatic overdue rent text reminders.",
  },
  devices: {
    title: "Trusted devices",
    description:
      "Allowed phones and computers that can save updates offline and upload payment photos.",
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
          <BusinessSettingsForm initialSettings={initialSettings} />
        )
      )}
    </div>
  );
}
