import { addDays, todayIST } from "./time";

export type SP = Record<string, string | string[] | undefined>;

export function str(sp: SP, key: string, max = 80): string {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? "").slice(0, max).trim();
}

export function dateParam(sp: SP, key: string, fallback: string): string {
  const s = str(sp, key, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return fallback;
  if (s < "2020-01-01" || s > "2100-01-01") return fallback;
  return s;
}

export function intParam(sp: SP, key: string, def: number, min: number, max: number): number {
  const n = parseInt(str(sp, key, 10), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function enumParam<T extends string>(sp: SP, key: string, allowed: readonly T[], def: T): T {
  const s = str(sp, key, 40);
  return (allowed as readonly string[]).includes(s) ? (s as T) : def;
}

/** Date range (inclusive, IST days). Swaps if reversed, clamps to 366 days. */
export function rangeParams(sp: SP, defDays = 0): { from: string; to: string } {
  const today = todayIST();
  const to0 = dateParam(sp, "to", today);
  const from0 = dateParam(sp, "from", addDays(to0, -defDays));
  let from = from0 <= to0 ? from0 : to0;
  const to = from0 <= to0 ? to0 : from0;
  if (addDays(from, 366) < to) from = addDays(to, -366);
  return { from, to };
}

/** Escape LIKE wildcards (backslash is Postgres' default escape char). */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function qs(base: Record<string, string | number | undefined | null | false>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v !== undefined && v !== null && v !== "" && v !== false) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}
