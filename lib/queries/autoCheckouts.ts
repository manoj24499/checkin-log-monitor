import { isMissing, query } from "../db";
import { likelyCause } from "../cause";
import { deliveredOf, msOf, triggerText, whenOf, type AttEvent } from "../events";
import { istRangeSql, msSql } from "../time";
import { getShiftAssignments } from "./shifts";

export interface AutoCheckout {
  attId: string;
  ts: number;
  inTs: number | null;
  userId: string;
  code: string;
  name: string;
  logged: boolean; // an AttendanceEvent exists
  trigger: string | null;
  triggerText: string;
  warnedAt: string | null;
  warnedMs: number | null;
  warningDelivered: boolean | null; // null = no warning logged / unknown
  hasWarning: boolean;
  cause: string; // computed likely cause (for legacy rows) or empty
}

export const EVENT_COLS = `e."id", (extract(epoch from e."createdAt") * 1000)::float8 AS ts, e."userId", e."attendanceId",
  e."kind"::text AS kind, e."actor"::text AS actor, e."summary"::text AS summary, e."detail" AS detail`;

/** Auto check-outs in range (optionally one user), enriched from AttendanceEvent when available. */
export async function getAutoCheckouts(
  from: string,
  to: string,
  userId?: string,
): Promise<{ rows: AutoCheckout[]; eventsMissing: boolean }> {
  const params: unknown[] = [from, to];
  let uf = "";
  if (userId) {
    params.push(userId);
    uf = `AND a."userId" = $3`;
  }
  const base = await query<{ attId: string; ts: number; inTs: number | null; userId: string; code: string; name: string }>(
    `SELECT a."id" AS "attId", ${msSql('a."timestamp"')} AS ts, a."userId", u."employeeCode" AS code, u."name" AS name,
            (SELECT ${msSql('i."timestamp"')} FROM "Attendance" i WHERE i."userId" = a."userId" AND i."type"::text = 'CHECK_IN'
              AND i."timestamp" < a."timestamp" ORDER BY i."timestamp" DESC LIMIT 1) AS "inTs"
     FROM "Attendance" a JOIN "User" u ON u."id" = a."userId"
     WHERE a."method"::text = 'AUTO' AND a."type"::text = 'CHECK_OUT' AND ${istRangeSql('a."timestamp"', "$1", "$2")} ${uf}
     ORDER BY a."timestamp" DESC LIMIT 100`,
    params,
  );
  if (base.length === 0) return { rows: [], eventsMissing: false };

  const userIds = [...new Set(base.map((b) => b.userId))];
  let events: AttEvent[] = [];
  let eventsMissing = false;
  try {
    events = await query<AttEvent>(
      `SELECT ${EVENT_COLS} FROM "AttendanceEvent" e
       WHERE e."userId" = ANY($1::text[]) AND e."kind"::text IN ('AUTO_CHECKOUT','AUTO_CHECKOUT_WARNING','PUSH_SENT')
         AND e."createdAt" >= ($2::date::timestamp - interval '2 days') AND e."createdAt" < (($3::date + 2)::timestamp)
       ORDER BY e."createdAt" ASC LIMIT 5000`,
      [userIds, from, to],
    );
  } catch (e) {
    if (!isMissing(e)) throw e;
    eventsMissing = true;
  }
  const { byUser } = await getShiftAssignments(userIds);

  const rows = base.map((b): AutoCheckout => {
    const ev = events.find((e) => e.kind === "AUTO_CHECKOUT" && e.userId === b.userId && (e.detail?.checkOutId === b.attId));
    const warn =
      [...events].reverse().find((e) => e.kind === "AUTO_CHECKOUT_WARNING" && e.userId === b.userId && e.ts <= b.ts && b.ts - e.ts < 24 * 3600000) ?? null;
    const warnedMs = warn?.ts ?? msOf(ev?.detail?.warnedAt);
    let warningDelivered: boolean | null = null;
    if (warnedMs != null) {
      const push = events.find((e) => e.kind === "PUSH_SENT" && e.userId === b.userId && e.ts >= warnedMs - 60000 && e.ts <= warnedMs + 5 * 60000);
      if (push) warningDelivered = deliveredOf(push);
    }
    const trigger = typeof ev?.detail?.trigger === "string" ? (ev.detail.trigger as string) : null;
    return {
      ...b,
      logged: !!ev,
      trigger,
      triggerText: ev ? triggerText(trigger) : "",
      warnedAt: whenOf(ev?.detail?.warnedAt) ?? (warn ? whenOf(warn.ts) : null),
      warnedMs,
      warningDelivered,
      hasWarning: warnedMs != null,
      cause: ev ? "" : likelyCause(b.ts, b.inTs, byUser.get(b.userId) ?? []),
    };
  });
  return { rows, eventsMissing };
}
