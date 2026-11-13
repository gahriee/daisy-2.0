import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { SettingsTabKey } from "@/components/features/settings/business-settings-form";
import { SettingsWorkspace } from "@/components/features/settings/settings-workspace";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getBusinessSettings } from "@/features/settings/service";
import { DEVICE_COOKIE_NAME, listOwnerDevices } from "@/server/auth/device";
import { isOwner } from "@/server/auth/owner";
import { getOwnerWorkspaceProfile } from "@/server/auth/workspace-profile";

export const instant = false;

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

const VALID_TABS: readonly SettingsTabKey[] = [
  "profile",
  "policies",
  "operations",
  "devices",
];

function resolveInitialTab(
  value: string | string[] | undefined,
): SettingsTabKey {
  if (
    typeof value === "string" &&
    VALID_TABS.includes(value as SettingsTabKey)
  ) {
    return value as SettingsTabKey;
  }
  return "profile";
}

export default async function SettingsPage({
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

  const [cookieStore, rawParams] = await Promise.all([cookies(), searchParams]);
  const currentDeviceToken = cookieStore.get(DEVICE_COOKIE_NAME)?.value;
  const initialTab = resolveInitialTab(rawParams.tab);

  const [settings, devices, profile] = await Promise.all([
    getBusinessSettings(ownerUserId),
    listOwnerDevices(ownerUserId, currentDeviceToken),
    getOwnerWorkspaceProfile(ownerUserId),
  ]);

  return (
    <WorkspaceShell title="Settings" profile={profile}>
      <Suspense fallback={null}>
        <SettingsWorkspace
          initialSettings={settings}
          initialDevices={devices}
          initialTab={initialTab}
        />
      </Suspense>
    </WorkspaceShell>
  );
}
