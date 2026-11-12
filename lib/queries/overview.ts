import { attemptsEnabled, query } from "../db";
import { istRangeSql } from "../time";

export interface OverviewStats {
  checkedIn: number;
  checkedOut: number;
  stillWorking: number;
  late: number;
  faceMismatch: number;
  rejected: number | null;
  offline: number;
  autoManual: number;
  attemptsEnabled: boolean;
}

export async function getOverview(day: string): Promise<OverviewStats> {
  const enabled = await attemptsEnabled();
  const r = await query<Record<string, number>>(
    `SELECT
       count(DISTINCT a."userId") FILTER (WHERE a."type"::text = 'CHECK_IN')::int AS "checkedIn",
       count(DISTINCT a."userId") FILTER (WHERE a."type"::text = 'CHECK_OUT')::int AS "checkedOut",
       count(DISTINCT a."userId") FILTER (WHERE a."type"::text = 'CHECK_IN' AND NOT EXISTS (
         SELECT 1 FROM "Attendance" o WHERE o."userId" = a."userId" AND o."type"::text = 'CHECK_OUT' AND o."timestamp" > a."timestamp"))::int AS "stillWorking",
       count(*) FILTER (WHERE a."type"::text = 'CHECK_IN' AND COALESCE(a."lateMinutes", 0) > 0)::int AS late,
       count(*) FILTER (WHERE a."faceVerifyStatus"::text = 'MISMATCH')::int AS "faceMismatch",
       count(*) FILTER (WHERE COALESCE(a."recordedOffline", false))::int AS offline,
       count(*) FILTER (WHERE a."method"::text IN ('AUTO','MANUAL'))::int AS "autoManual"
     FROM "Attendance" a
     WHERE ${istRangeSql('a."timestamp"', "$1", "$1")}`,
    [day],
  );
  const s = r[0] ?? {};
  let rejected: number | null = null;
  let faceMismatch = s.faceMismatch ?? 0;
  if (enabled) {
    const a = await query<{ rejected: number; face: number }>(
      `SELECT count(*) FILTER (WHERE "outcome" IN ('REJECTED','ERROR'))::int AS rejected,
              count(*) FILTER (WHERE "reasonCode" = 'FACE_MISMATCH' AND "attendanceId" IS NULL)::int AS face
       FROM "CheckInAttempt" WHERE ${istRangeSql('"createdAt"', "$1", "$1")}`,
      [day],
    );
    rejected = a[0]?.rejected ?? 0;
    faceMismatch += a[0]?.face ?? 0;
  }
  return {
    checkedIn: s.checkedIn ?? 0,
    checkedOut: s.checkedOut ?? 0,
    stillWorking: s.stillWorking ?? 0,
    late: s.late ?? 0,
    faceMismatch,
    rejected,
    offline: s.offline ?? 0,
    autoManual: s.autoManual ?? 0,
    attemptsEnabled: enabled,
  };
}
