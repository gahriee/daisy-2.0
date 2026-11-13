import { isOwner } from "@/server/auth/owner";
import { getDatabase } from "@/server/db/client";
import { checkStorage } from "@/server/storage/client";

export async function GET(): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (!(await isOwner()))
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    await getDatabase().$queryRaw`SELECT 1`;
    await checkStorage();
    return Response.json(
      { database: "connected", auth: "owner", storage: "connected" },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Service unavailable" },
      { status: 503, headers },
    );
  }
}
