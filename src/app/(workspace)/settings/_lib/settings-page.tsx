import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { SettingsSectionKey } from "@/components/features/settings/business-settings-form";
import { SettingsWorkspace } from "@/components/features/settings/settings-workspace";
import { getBusinessSettings } from "@/features/settings/service";
import { DEVICE_COOKIE_NAME, listOwnerDevices } from "@/server/auth/device";
import { isOwner } from "@/server/auth/owner";

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
    const devices = await listOwnerDevices(ownerUserId, currentDeviceToken);

    return <SettingsWorkspace section="devices" initialDevices={devices} />;
  }

  const settings = await getBusinessSettings(ownerUserId);

  return <SettingsWorkspace section={section} initialSettings={settings} />;
}
