import { redirect } from "next/navigation";
import { connection } from "next/server";
import { HouseRulesEditor } from "@/components/features/settings/house-rules-editor";
import { getBusinessSettings } from "@/features/settings/service";
import { isOwner } from "@/server/auth/owner";

export const instant = false;

export default async function TransientHouseRulesPage() {
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

  const settings = await getBusinessSettings(ownerUserId);

  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <h1
          id="house-rules-heading"
          className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
        >
          House rules
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Configure one rule per row. Saved rules appear on the public /book
          storefront and room detail pages.
        </p>
      </header>

      <HouseRulesEditor initialSettings={settings} />
    </div>
  );
}
