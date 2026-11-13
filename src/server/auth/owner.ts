import "server-only";
import { z } from "zod";
import { UnauthenticatedError } from "@/lib/errors";
import { getAuth } from "./server";

export {
  ensureOwnerRecord,
  type DatabaseExecutor,
} from "@/server/db/owner-record";

const sessionSchema = z.object({
  user: z.object({ id: z.string().min(1) }),
  session: z.object({ userId: z.string().min(1), expiresAt: z.coerce.date() }),
});

export async function isOwner(): Promise<boolean> {
  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId) return false;
  const { data, error } = await getAuth().getSession({
    query: { disableCookieCache: "true" },
  });
  if (error) return false;
  const parsed = sessionSchema.safeParse(data);
  return (
    parsed.success &&
    parsed.data.user.id === ownerId &&
    parsed.data.session.userId === ownerId &&
    parsed.data.session.expiresAt.getTime() > Date.now()
  );
}

/**
 * Verifies a fresh provider session bound to OWNER_USER_ID and returns the Owner ID.
 */
export async function requireOwnerUserId(): Promise<string> {
  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId || !(await isOwner())) {
    throw new UnauthenticatedError();
  }
  return ownerId;
}
