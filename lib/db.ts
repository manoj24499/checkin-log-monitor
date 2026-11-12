import { Pool, type QueryResultRow } from "pg";

// Single shared, read-only pool. Reused across hot reloads in dev.
const g = globalThis as unknown as { __monitorPool?: Pool };

function createPool(): Pool {
  const url = process.env.MONITOR_DATABASE_URL;
  if (!url) throw new Error("MONITOR_DATABASE_URL is not set");
  let local = false;
  try {
    const host = new URL(url).hostname;
    local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    /* treat as remote */
  }
  const envMax = Number(process.env.MONITOR_POOL_MAX);
  const max = envMax > 0 ? Math.min(envMax, 5) : 5;
  // sslmode in the URL would override the ssl option, so strip it.
  const cleaned = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const pool = new Pool({
    connectionString: cleaned,
    max,
    ssl: local ? false : { rejectUnauthorized: false },
    statement_timeout: 15000,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  pool.on("error", () => {
    /* idle client errors must not crash the process */
  });
  return pool;
}

export function getPool(): Pool {
  if (!g.__monitorPool) g.__monitorPool = createPool();
  return g.__monitorPool;
}

const ALLOWED = /^\s*(\(\s*)*(select|with)\b/i;

/** Parameterized, SELECT/WITH-only query helper. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!ALLOWED.test(sql)) throw new Error("Only SELECT queries are allowed");
  const res = await getPool().query<T>(sql, params);
  return res.rows;
}

export function pgCode(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined;
}

let attemptCache: { at: number; ok: boolean } | null = null;

/** Whether "CheckInAttempt" exists (migration applied). Cached for 20s. */
export async function attemptsEnabled(): Promise<boolean> {
  if (attemptCache && Date.now() - attemptCache.at < 20000) return attemptCache.ok;
  let ok = false;
  try {
    const r = await query<{ t: string | null }>(`SELECT to_regclass('public."CheckInAttempt"')::text AS t`);
    ok = !!r[0]?.t;
  } catch (e) {
    if (pgCode(e) !== "42P01") throw e;
  }
  attemptCache = { at: Date.now(), ok };
  return ok;
}

/** Positional-parameter builder: p.add(v) returns "$n". */
export class Params {
  values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}
