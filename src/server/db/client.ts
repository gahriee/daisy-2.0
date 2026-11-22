import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Prisma, PrismaClient } from "../../generated/prisma/client";
import { readDatabaseUrl } from "./environment";

function createClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
    transactionOptions: {
      maxWait: 10_000,
      timeout: 20_000,
    },
  });
}

function computeGeneratedSchemaFingerprint(): string {
  const enumKeys = Object.keys(Prisma)
    .filter((key) => key === "ModelName" || key.endsWith("ScalarFieldEnum"))
    .sort();
  return enumKeys
    .map((key) => {
      const entry = (Prisma as Record<string, unknown>)[key];
      if (!entry || typeof entry !== "object") return key;
      return `${key}:${Object.keys(entry as Record<string, unknown>)
        .sort()
        .join(",")}`;
    })
    .join("|");
}

// Automatically changes whenever `pnpm db:generate` adds, removes, or renames
// any model or column, while remaining identical across split Next.js chunks.
const PRISMA_SCHEMA_FINGERPRINT = computeGeneratedSchemaFingerprint();

type CachedDatabase = {
  url: string;
  schemaFingerprint: string;
  client: PrismaClient;
  disconnected?: boolean;
};

type CloudflareRequestContext = {
  ctx?: object;
};

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for("__cloudflare-context__");
const CLOUDFLARE_USER_AGENT = "Cloudflare-Workers";

// The module survives between requests; development HMR and split route chunks
// share globalThis.daisyDatabase so one chunk never disconnects another's pool.
const globalDatabase = globalThis as typeof globalThis & {
  daisyDatabase?: CachedDatabase;
};
let moduleDatabase: CachedDatabase | undefined;
// In Cloudflare Workers, cache PrismaClient per ExecutionContext rather than
// globally so Neon WebSocket sockets never cross request isolation boundaries.
const cloudflareRequestDatabases = new WeakMap<object, CachedDatabase>();

function hasUsableClient(client: unknown): client is PrismaClient {
  if (client instanceof PrismaClient) {
    return true;
  }
  return (
    typeof client === "object" &&
    client !== null &&
    typeof (client as { $disconnect?: unknown }).$disconnect === "function"
  );
}

function disconnectCached(entry: CachedDatabase | undefined): void {
  if (!entry || entry.disconnected) {
    return;
  }
  entry.disconnected = true;
  void entry.client.$disconnect().catch(() => {});
}

function isCloudflareWorkersRuntime(): boolean {
  return (
    typeof globalThis.navigator === "object" &&
    globalThis.navigator !== null &&
    globalThis.navigator.userAgent === CLOUDFLARE_USER_AGENT
  );
}

function getActiveCloudflareContext(): CloudflareRequestContext | undefined {
  const candidate = (globalThis as Record<symbol, unknown>)[
    CLOUDFLARE_CONTEXT_SYMBOL
  ];
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }
  return candidate as CloudflareRequestContext;
}

function getCloudflareRequestDatabase(url: string): PrismaClient {
  const requestCtx = getActiveCloudflareContext()?.ctx;
  if (!requestCtx || typeof requestCtx !== "object") {
    return createClient(url);
  }

  const cached = cloudflareRequestDatabases.get(requestCtx);
  if (
    cached &&
    !cached.disconnected &&
    cached.url === url &&
    cached.schemaFingerprint === PRISMA_SCHEMA_FINGERPRINT &&
    hasUsableClient(cached.client)
  ) {
    return cached.client;
  }

  disconnectCached(cached);
  const entry: CachedDatabase = {
    url,
    schemaFingerprint: PRISMA_SCHEMA_FINGERPRINT,
    client: createClient(url),
  };
  cloudflareRequestDatabases.set(requestCtx, entry);
  return entry.client;
}

export function getDatabase(): PrismaClient {
  const url = readDatabaseUrl(process.env);

  if (isCloudflareWorkersRuntime()) {
    return getCloudflareRequestDatabase(url);
  }

  const cached =
    process.env.NODE_ENV !== "production"
      ? (globalDatabase.daisyDatabase ?? moduleDatabase)
      : (moduleDatabase ?? globalDatabase.daisyDatabase);

  if (
    cached &&
    !cached.disconnected &&
    cached.url === url &&
    cached.schemaFingerprint === PRISMA_SCHEMA_FINGERPRINT &&
    hasUsableClient(cached.client)
  ) {
    moduleDatabase = cached;
    return cached.client;
  }

  disconnectCached(cached);
  if (moduleDatabase && moduleDatabase !== cached) {
    disconnectCached(moduleDatabase);
  }

  const entry: CachedDatabase = {
    url,
    schemaFingerprint: PRISMA_SCHEMA_FINGERPRINT,
    client: createClient(url),
  };
  moduleDatabase = entry;
  if (process.env.NODE_ENV !== "production") {
    globalDatabase.daisyDatabase = entry;
  }
  return entry.client;
}
