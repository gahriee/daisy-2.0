import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { SettingsSectionKey } from "@/components/features/settings/business-settings-form";
import { SettingsWorkspace } from "@/components/features/settings/settings-workspace";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getBusinessSettings } from "@/features/settings/service";
import { DEVICE_COOKIE_NAME, listOwnerDevices } from "@/server/auth/device";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

const SECTION_TITLES: Record<SettingsSectionKey, string> = {
  profile: "Property profile",
  policies: "Billing & policies",
  operations: "Stays & limits",
  devices: "Trusted devices",
};

export async function renderSettingsSectionPage(section: SettingsSectionKey) {
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

  if (section === "devices") {
    const cookieStore = await cookies();
    const currentDeviceToken = cookieStore.get(DEVICE_COOKIE_NAME)?.value;
    const [devices, profile] = await Promise.all([
      listOwnerDevices(ownerUserId, currentDeviceToken),
      getOwnerWorkspaceProfile(ownerUserId),
    ]);

    return (
      <WorkspaceShell title={SECTION_TITLES[section]} profile={profile}>
        <SettingsWorkspace section="devices" initialDevices={devices} />
      </WorkspaceShell>
    );
  }

  const [settings, profile] = await Promise.all([
    getBusinessSettings(ownerUserId),
    getOwnerWorkspaceProfile(ownerUserId),
  ]);

  return (
    <WorkspaceShell title={SECTION_TITLES[section]} profile={profile}>
      <SettingsWorkspace section={section} initialSettings={settings} />
    </WorkspaceShell>
  );
}
