const TZ = "Asia/Kolkata";

export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); // YYYY-MM-DD
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fmtDateTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ, day: "2-digit", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  }).format(new Date(ms));
}

export function fmtTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "-";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms));
}

export function fmtDate(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date(ms));
}

/** IST YYYY-MM-DD of an epoch-ms instant. */
export function istDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(ms));
}

export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** SQL fragment: IST day-range filter on a UTC-naive timestamp column. */
export function istRangeSql(col: string, fromParam: string, toParam: string): string {
  return `${col} >= (${fromParam}::date::timestamp - interval '330 minutes') AND ${col} < ((${toParam}::date + 1)::timestamp - interval '330 minutes')`;
}

/** SQL: epoch milliseconds of a UTC-naive timestamp column. */
export function msSql(col: string): string {
  return `(extract(epoch from ${col}) * 1000)::float8`;
}
