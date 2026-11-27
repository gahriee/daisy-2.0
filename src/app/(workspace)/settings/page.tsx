import type { Metadata } from "next";
import { renderSettingsSectionPage } from "./_lib/settings-page";

export const metadata: Metadata = {
  title: "Settings | Daisy",
};

export default async function SettingsIndexPage() {
  return renderSettingsSectionPage("property");
}
