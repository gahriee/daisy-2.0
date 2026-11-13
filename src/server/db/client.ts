import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../generated/prisma/client";
import { readDatabaseUrl } from "./environment";

function createClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

// The module survives between requests; development HMR reuses compatible clients.
const globalDatabase = globalThis as typeof globalThis & {
  daisyDatabase?: { url: string; client: PrismaClient };
};
let moduleDatabase: { url: string; client: PrismaClient } | undefined;

export function getDatabase(): PrismaClient {
  const url = readDatabaseUrl(process.env);
  const cached = moduleDatabase ?? globalDatabase.daisyDatabase;
  if (cached?.url === url && cached.client instanceof PrismaClient)
    return cached.client;
  if (cached) void cached.client.$disconnect();
  const client = createClient(url);
  moduleDatabase = { url, client };
  if (process.env.NODE_ENV !== "production")
    globalDatabase.daisyDatabase = { url, client };
  return client;
}
