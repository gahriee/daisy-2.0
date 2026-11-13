import { config } from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { readDatabaseUrl } from "../src/server/db/environment";

config({ path: ".env.local", quiet: true });

async function main(): Promise<void> {
  const connectionString = readDatabaseUrl(process.env);
  const client = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });
  try {
    const rows = await client.$queryRaw<
      Array<{ database: string; timezone: string }>
    >`
      SELECT current_database()::text AS database, current_setting('TimeZone')::text AS timezone
    `;
    const row = rows[0];
    if (!row) throw new Error("No connection result.");
    console.log(
      JSON.stringify({
        connected: true,
        host: new URL(connectionString).hostname,
        ...row,
      }),
    );
    if (!["UTC", "Etc/UTC", "Etc/GMT", "GMT"].includes(row.timezone))
      throw new Error("Database timezone must be UTC.");
  } finally {
    await client.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Database check failed. Verify development DATABASE_URL, TLS, access and UTC timezone. No database changes were made.",
  );
  process.exitCode = 1;
});
