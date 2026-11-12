import { attemptsEnabled, query } from "../db";
import { likeEscape } from "../params";
import { istRangeSql, msSql } from "../time";

export interface EmployeeListRow {
  code: string;
  name: string;
  workMode: string;
  face: boolean;
  active: boolean;
  lastIn: number | null;
  rejected7: number | null;
}

export async function listEmployees(q: string): Promise<{ rows: EmployeeListRow[]; attemptsEnabled: boolean }> {
  const enabled = await attemptsEnabled();
  const params: unknown[] = [];
  let where = `u."role"::text = 'EMPLOYEE'`;
  if (q) {
    params.push(`%${likeEscape(q)}%`);
    where += ` AND (u."employeeCode" ILIKE $1 OR u."name" ILIKE $1)`;
  }
  const rows = await query<EmployeeListRow>(
    `SELECT u."employeeCode" AS code, u."name" AS name, u."workMode"::text AS "workMode",
            u."faceVerificationEnabled" AS face, u."active" AS active,
            (SELECT ${msSql('max(a."timestamp")')} FROM "Attendance" a WHERE a."userId" = u."id" AND a."type"::text = 'CHECK_IN') AS "lastIn",
            ${
              enabled
                ? `(SELECT count(*)::int FROM "CheckInAttempt" c WHERE c."employeeCode" = u."employeeCode"
                     AND c."outcome" IN ('REJECTED','ERROR') AND c."createdAt" > (now() AT TIME ZONE 'UTC') - interval '7 days')`
                : "NULL::int"
            } AS rejected7
     FROM "User" u
     WHERE ${where}
     ORDER BY u."active" DESC, u."name" ASC
     LIMIT 500`,
    params,
  );
  return { rows, attemptsEnabled: enabled };
}

export interface EmployeeProfile {
  id: string;
  code: string;
  name: string;
  role: string;
  workMode: string;
  face: boolean;
  active: boolean;
}

export async function getEmployee(code: string): Promise<EmployeeProfile | null> {
  const r = await query<EmployeeProfile>(
    `SELECT u."id", u."employeeCode" AS code, u."name", u."role"::text AS role, u."workMode"::text AS "workMode",
            u."faceVerificationEnabled" AS face, u."active"
     FROM "User" u WHERE u."employeeCode" = $1 ORDER BY u."active" DESC LIMIT 1`,
    [code],
  );
  return r[0] ?? null;
}

export interface AttRec {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  method: string;
  ts: number;
  dayKey: string;
  late: number | null;
  leave: string;
  face: string;
  sim: number | null;
  mode: string | null;
  hasPhoto: boolean;
  offline: boolean;
  offlineVerified: boolean | null;
  outside: boolean;
}

/** Records for the range, extended one day back so overnight shifts pair. */
export async function getUserRecords(userId: string, from: string, to: string): Promise<AttRec[]> {
  return query<AttRec>(
    `SELECT a."id", a."type"::text AS type, a."method"::text AS method, ${msSql('a."timestamp"')} AS ts, a."dayKey",
            a."lateMinutes"::int AS late, a."leaveType"::text AS leave, a."faceVerifyStatus"::text AS face,
            a."faceSimilarity"::float8 AS sim, a."checkInMode"::text AS mode, a."hasPhoto" AS "hasPhoto",
            COALESCE(a."recordedOffline", false) AS offline, a."offlineTimeVerified" AS "offlineVerified",
            COALESCE(a."offlineOutsideArea", false) AS outside
     FROM "Attendance" a
     WHERE a."userId" = $1
       AND a."timestamp" >= ($2::date::timestamp - interval '330 minutes' - interval '1 day')
       AND a."timestamp" < (($3::date + 1)::timestamp - interval '330 minutes' + interval '1 day')
     ORDER BY a."timestamp" ASC, a."id" ASC
     LIMIT 2000`,
    [userId, from, to],
  );
}

export interface Shift {
  day: string; // IST day of the check-in (or of the orphan check-out)
  inRec: AttRec | null;
  outRec: AttRec | null;
  workedMs: number | null;
}

const MAX_SHIFT_MS = 24 * 60 * 60 * 1000;

/** Pair each CHECK_OUT with the nearest earlier unpaired CHECK_IN (<24h earlier). */
export function pairShifts(recs: AttRec[], istDay: (ms: number) => string): Shift[] {
  const sorted = [...recs].sort((a, b) => a.ts - b.ts);
  const open: Shift[] = [];
  const shifts: Shift[] = [];
  for (const r of sorted) {
    if (r.type === "CHECK_IN") {
      const s: Shift = { day: istDay(r.ts), inRec: r, outRec: null, workedMs: null };
      open.push(s);
      shifts.push(s);
    } else {
      let idx = -1;
      for (let i = open.length - 1; i >= 0; i--) {
        if (r.ts - open[i].inRec!.ts <= MAX_SHIFT_MS) idx = i;
        break; // only the nearest earlier unpaired CHECK_IN is eligible
      }
      if (idx >= 0) {
        const s = open.splice(idx, 1)[0];
        s.outRec = r;
        s.workedMs = r.ts - s.inRec!.ts;
      } else {
        shifts.push({ day: istDay(r.ts), inRec: null, outRec: r, workedMs: null });
      }
    }
  }
  return shifts;
}

export async function getUserPhotos(userId: string, from: string, to: string) {
  return query<{ id: string; ts: number; type: string }>(
    `SELECT a."id", ${msSql('a."timestamp"')} AS ts, a."type"::text AS type
     FROM "Attendance" a
     WHERE a."userId" = $1 AND a."hasPhoto" AND ${istRangeSql('a."timestamp"', "$2", "$3")}
     ORDER BY a."timestamp" DESC LIMIT 12`,
    [userId, from, to],
  );
}
