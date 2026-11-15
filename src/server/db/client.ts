import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../generated/prisma/client";
import { readDatabaseUrl } from "./environment";

function createClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

const PRISMA_CLIENT_SCHEMA_TAG =
  "20261114150000_building_separation_and_tenant_contracts";

// The module survives between requests; development HMR reuses compatible clients.
const globalDatabase = globalThis as typeof globalThis & {
  daisyDatabase?: { url: string; schemaTag?: string; client: PrismaClient };
};
let moduleDatabase:
  { url: string; schemaTag?: string; client: PrismaClient } | undefined;

export function getDatabase(): PrismaClient {
  const url = readDatabaseUrl(process.env);
  const cached = moduleDatabase ?? globalDatabase.daisyDatabase;
  if (
    cached?.url === url &&
    cached.schemaTag === PRISMA_CLIENT_SCHEMA_TAG &&
    cached.client instanceof PrismaClient
  )
    return cached.client;
  if (cached) void cached.client.$disconnect();
  const client = createClient(url);
  moduleDatabase = { url, schemaTag: PRISMA_CLIENT_SCHEMA_TAG, client };
  if (process.env.NODE_ENV !== "production")
    globalDatabase.daisyDatabase = {
      url,
      schemaTag: PRISMA_CLIENT_SCHEMA_TAG,
      client,
    };
  return client;
}
