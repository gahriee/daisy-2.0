import "server-only";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { getAuth } from "./server";

export type OwnerWorkspaceProfile = {
  ownerName: string;
  businessName: string;
};

const sessionProfileSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string().optional().nullable(),
  }),
});

/**
 * Loads non-sensitive display names for the workspace topbar profile and
 * sidebar workspace switcher without exposing email addresses or tokens.
 */
export async function getOwnerWorkspaceProfile(
  ownerUserId: string,
): Promise<OwnerWorkspaceProfile> {
  const [sessionResult, settings] = await Promise.all([
    getAuth()
      .getSession({ query: { disableCookieCache: "true" } })
      .catch(() => ({ data: null })),
    getDatabase()
      .businessSettings.findUnique({
        where: { ownerUserId },
        select: { businessName: true },
      })
      .catch(() => null),
  ]);

  const parsed = sessionProfileSchema.safeParse(sessionResult?.data);
  const rawName = parsed.success ? parsed.data.user.name?.trim() : "";
  const rawBusiness = settings?.businessName?.trim();

  return {
    ownerName: rawName || "Property Owner",
    businessName: rawBusiness || "Daisy Workspace",
  };
}
