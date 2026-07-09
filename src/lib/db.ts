import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

// Cache clients per-request to avoid re-creating on every API call
// On Cloudflare: D1 binding comes from getCloudflareContext()
// In local dev: fall back to standard PrismaClient with SQLite URL

let _localClient: PrismaClient | null = null;
let _cloudflareClient: PrismaClient | null = null;

/**
 * Get a PrismaClient configured for the current runtime.
 *
 * On Cloudflare Workers (via OpenNext), this uses the D1 binding from context.
 * In local development, this uses the standard PrismaClient with DATABASE_URL.
 */
export async function getDb(): Promise<PrismaClient> {
  // Try to get Cloudflare context (only available on Cloudflare Workers)
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = getCloudflareContext();
    const d1 = (ctx.env as any)?.DB;
    if (d1) {
      // Reuse cached client for the same D1 binding
      if (!_cloudflareClient) {
        const adapter = new PrismaD1(d1);
        _cloudflareClient = new PrismaClient({ adapter }) as unknown as PrismaClient;
      }
      return _cloudflareClient;
    }
  } catch {
    // Not on Cloudflare — fall through to local client
  }

  // Local development
  if (!_localClient) {
    _localClient = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
  }
  return _localClient;
}

/**
 * Backward-compatible `db` export.
 *
 * In local dev, this works like a normal PrismaClient.
 * On Cloudflare, this is an async proxy that delegates to getDb() on every access.
 *
 * Usage in API routes (unchanged from before):
 *   import { db } from "@/lib/db";
 *   const list = await db.tierList.findUnique({ where: { id } });
 *
 * On Cloudflare, each `db.xxx.yyy()` call internally calls getDb() first,
 * which returns the D1-backed PrismaClient.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop: string) {
    // db.tierList → return a proxy that handles .findUnique(), .create(), etc.
    return createAsyncProxy([prop]);
  },
});

// Helper to create a chain of async proxies for nested property access
// path = ["tierList", "findUnique"] → calls client.tierList.findUnique(...args)
function createAsyncProxy(path: string[]): any {
  return new Proxy(function () {}, {
    get(_t, prop: string) {
      // db.tierList.findUnique → extend the path
      return createAsyncProxy([...path, prop]);
    },
    apply(_t, _thisArg, args) {
      // db.tierList.findUnique(...) → resolve the chain
      return (async () => {
        const client = await getDb();
        let obj: any = client;
        for (const p of path) {
          obj = obj?.[p];
        }
        if (typeof obj !== "function") return obj;
        return obj.apply(client, args);
      })();
    },
  });
}
