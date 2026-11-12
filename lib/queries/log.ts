import { Params, attemptsEnabled, pgCode, query } from "../db";
import { enumParam, likeEscape, rangeParams, str, type SP } from "../params";
import { istRangeSql, msSql } from "../time";

export interface LogFilters {
  from: string;
  to: string;
  q: string; // employee code/name search (substring)
  code: string; // exact employee code
  action: "" | "CHECK_IN" | "CHECK_OUT";
  outcome: "" | "success" | "rejected" | "error";
  reason: string;
  face: "" | "MATCHED" | "MISMATCH" | "UNAVAILABLE" | "NOT_CHECKED";
  source: "" | "app" | "kiosk" | "auto" | "manual";
  offline: boolean;
  how: "" | "swipe" | "offline" | "kiosk" | "auto" | "manual";
}

export interface LogRow {
  kind: "attempt" | "record";
  rid: string;
  ts: number;
  uid: string | null;
  code: string | null;
  name: string | null;
  action: string;
  outcome: string;
  reasonCode: string | null;
  reason: string | null;
  mode: string | null;
  source: string | null;
  offline: boolean;
  face: string | null;
  sim: number | null;
  late: number | null;
  lat: number | null;
  lng: number | null;
  mocked: boolean | null;
  ip: string | null;
  attId: string | null;
  hasPhoto: boolean;
  aHasPhoto: boolean; // attempt (failed-face) photo available
  how: string; // swipe | offline | kiosk | auto | manual | unknown
}

export const REASONS = [
  "INVALID_PIN", "FACE_MISMATCH", "OUTSIDE_AREA", "MOCK_LOCATION", "ALREADY_CHECKED_IN", "ALREADY_CHECKED_OUT",
  "NOT_CHECKED_IN", "PHOTO_REQUIRED", "RATE_LIMITED", "OFFLINE_REJECTED", "SERVER_ERROR", "OTHER",
  "AUTO_ENTRY", "MANUAL_ENTRY",
] as const;

export function parseLogFilters(sp: SP, defDays = 0): LogFilters {
  const { from, to } = rangeParams(sp, defDays);
  const reasonRaw = str(sp, "reason", 40);
  return {
    from,
    to,
    q: str(sp, "q", 60),
    code: "",
    action: enumParam(sp, "action", ["", "CHECK_IN", "CHECK_OUT"] as const, ""),
    outcome: enumParam(sp, "outcome", ["", "success", "rejected", "error"] as const, ""),
    reason: (REASONS as readonly string[]).includes(reasonRaw) ? reasonRaw : "",
    face: enumParam(sp, "face", ["", "MATCHED", "MISMATCH", "UNAVAILABLE", "NOT_CHECKED"] as const, ""),
    source: enumParam(sp, "source", ["", "app", "kiosk", "auto", "manual"] as const, ""),
    offline: str(sp, "offline", 2) === "1",
    how: enumParam(sp, "how", ["", "swipe", "offline", "kiosk", "auto", "manual"] as const, ""),
  };
}

function buildSql(f: LogFilters, withAttempts: boolean, limit: number, offset: number, newCols = true) {
  const ca = newCols ? 'a."clientAction"' : "NULL::text";
  const p = new Params();
  const from = p.add(f.from);
  const to = p.add(f.to);

  const attemptPart = `
    SELECT 'attempt'::text AS kind, a."id" AS rid, ${msSql('a."createdAt"')} AS ts,
      a."userId" AS uid, a."employeeCode" AS code, u."name" AS name,
      a."action"::text AS action, a."outcome"::text AS outcome, a."reasonCode"::text AS "reasonCode", a."reason"::text AS reason,
      COALESCE(att."checkInMode"::text, a."checkInMode"::text) AS mode,
      CASE upper(a."source") WHEN 'MOBILE' THEN 'app' ELSE lower(a."source") END AS source,
      (a."offline" OR COALESCE(att."recordedOffline", false)) AS offline,
      COALESCE(NULLIF(att."faceVerifyStatus"::text, 'NOT_CHECKED'), a."faceVerifyStatus"::text) AS face,
      COALESCE(att."faceSimilarity", a."faceSimilarity")::float8 AS sim,
      att."lateMinutes"::int AS late,
      a."latitude"::float8 AS lat, a."longitude"::float8 AS lng, a."mocked" AS mocked,
      a."ipAddress"::text AS ip, a."attendanceId" AS "attId", COALESCE(att."hasPhoto", false) AS "hasPhoto", COALESCE(a."hasPhoto", false) AS "aHasPhoto",
      CASE WHEN upper(a."source") = 'KIOSK' THEN 'kiosk' WHEN ${ca} = 'OFFLINE_SYNC' OR a."offline" THEN 'offline'
           WHEN ${ca} = 'SLIDE_TO_CONFIRM' THEN 'swipe' ELSE 'unknown' END AS how
    FROM "CheckInAttempt" a
    LEFT JOIN "User" u ON u."id" = a."userId"
    LEFT JOIN "Attendance" att ON att."id" = a."attendanceId"
    WHERE ${istRangeSql('a."createdAt"', from, to)}`;

  const recordPart = `
    SELECT 'record'::text AS kind, att."id" AS rid, ${msSql('att."timestamp"')} AS ts,
      att."userId" AS uid, u."employeeCode" AS code, u."name" AS name,
      att."type"::text AS action, 'SUCCESS'::text AS outcome,
      CASE att."method"::text WHEN 'AUTO' THEN 'AUTO_ENTRY' WHEN 'MANUAL' THEN 'MANUAL_ENTRY' ELSE NULL END AS "reasonCode",
      att."manualReason"::text AS reason,
      att."checkInMode"::text AS mode,
      CASE att."method"::text WHEN 'AUTO' THEN 'auto' WHEN 'MANUAL' THEN 'manual' WHEN 'QR' THEN 'kiosk' ELSE 'app' END AS source,
      COALESCE(att."recordedOffline", false) AS offline,
      att."faceVerifyStatus"::text AS face, att."faceSimilarity"::float8 AS sim, att."lateMinutes"::int AS late,
      NULL::float8 AS lat, NULL::float8 AS lng, NULL::boolean AS mocked, NULL::text AS ip,
      att."id" AS "attId", att."hasPhoto" AS "hasPhoto", false AS "aHasPhoto",
      CASE att."method"::text WHEN 'AUTO' THEN 'auto' WHEN 'MANUAL' THEN 'manual' WHEN 'QR' THEN 'kiosk' ELSE 'unknown' END AS how
    FROM "Attendance" att
    JOIN "User" u ON u."id" = att."userId"
    WHERE ${istRangeSql('att."timestamp"', from, to)}
    ${withAttempts ? `AND NOT EXISTS (SELECT 1 FROM "CheckInAttempt" a2 WHERE a2."attendanceId" = att."id")` : ""}`;

  const where: string[] = [];
  if (f.q) {
    const like = p.add(`%${likeEscape(f.q)}%`);
    where.push(`(x.code ILIKE ${like} OR x.name ILIKE ${like})`);
  }
  if (f.code) where.push(`x.code = ${p.add(f.code)}`);
  if (f.action) where.push(`x.action = ${p.add(f.action)}`);
  if (f.outcome) where.push(`upper(x.outcome) = ${p.add(f.outcome.toUpperCase())}`);
  if (f.reason) where.push(`x."reasonCode" = ${p.add(f.reason)}`);
  if (f.face) where.push(`x.face = ${p.add(f.face)}`);
  if (f.source) where.push(`x.source = ${p.add(f.source)}`);
  if (f.offline) where.push(`x.offline`);
  if (f.how) where.push(`x.how = ${p.add(f.how)}`);

  const sql = `
    SELECT * FROM (
      ${withAttempts ? `${attemptPart} UNION ALL` : ""} ${recordPart}
    ) x
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY x.ts DESC, x.rid DESC
    LIMIT ${p.add(limit)} OFFSET ${p.add(offset)}`;
  return { sql, values: p.values };
}

export async function queryLog(
  f: LogFilters,
  limit: number,
  offset: number,
): Promise<{ rows: LogRow[]; attemptsEnabled: boolean }> {
  const enabled = await attemptsEnabled();
  try {
    const { sql, values } = buildSql(f, enabled, limit, offset, true);
    return { rows: await query<LogRow>(sql, values), attemptsEnabled: enabled };
  } catch (e) {
    // 42703 = new "clientAction" column not migrated yet: retry without it.
    if (!enabled || pgCode(e) !== "42703") throw e;
    const { sql, values } = buildSql(f, enabled, limit, offset, false);
    return { rows: await query<LogRow>(sql, values), attemptsEnabled: enabled };
  }
}
