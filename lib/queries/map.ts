import { attemptsEnabled, query } from "../db";
import { istRangeSql, msSql } from "../time";

export const MAP_CAP = 5000;
export const GAP_MS = 15 * 60 * 1000;

export interface MapPoint {
  id: string;
  ts: number;
  code: string;
  name: string;
  action: string; // CHECK_IN | CHECK_OUT | UNKNOWN
  outcome: string; // SUCCESS | REJECTED | ERROR
  reasonCode: string | null;
  mocked: boolean;
  lat: number;
  lng: number;
  approx: boolean; // location taken from nearest LocationPing (no attempt row)
}

export interface TrailPoint {
  ts: number;
  lat: number;
  lng: number;
  acc: number;
}

export interface TrackingGap {
  fromTs: number;
  toTs: number;
  minutes: number;
  fromIdx: number; // index in trail
}

export async function getMapPoints(day: string): Promise<{ points: MapPoint[]; capped: boolean; attemptsEnabled: boolean }> {
  const enabled = await attemptsEnabled();
  const parts: string[] = [];
  if (enabled) {
    parts.push(`
      SELECT a."id", ${msSql('a."createdAt"')} AS ts, a."employeeCode" AS code, COALESCE(u."name", a."employeeCode") AS name,
             a."action"::text AS action, a."outcome"::text AS outcome, a."reasonCode"::text AS "reasonCode",
             COALESCE(a."mocked", false) AS mocked, a."latitude"::float8 AS lat, a."longitude"::float8 AS lng, false AS approx
      FROM "CheckInAttempt" a LEFT JOIN "User" u ON u."id" = a."userId"
      WHERE a."latitude" IS NOT NULL AND a."longitude" IS NOT NULL AND ${istRangeSql('a."createdAt"', "$1", "$1")}`);
  }
  // Accepted records that have no attempt row: approximate with the nearest ping within 5 minutes.
  parts.push(`
    SELECT att."id", ${msSql('att."timestamp"')} AS ts, u."employeeCode" AS code, u."name" AS name,
           att."type"::text AS action, 'SUCCESS'::text AS outcome, NULL::text AS "reasonCode",
           false AS mocked, p.latitude::float8 AS lat, p.longitude::float8 AS lng, true AS approx
    FROM "Attendance" att
    JOIN "User" u ON u."id" = att."userId"
    JOIN LATERAL (
      SELECT lp."latitude", lp."longitude" FROM "LocationPing" lp
      WHERE lp."userId" = att."userId"
        AND lp."timestamp" BETWEEN att."timestamp" - interval '5 minutes' AND att."timestamp" + interval '5 minutes'
      ORDER BY abs(extract(epoch from (lp."timestamp" - att."timestamp"))) LIMIT 1
    ) p ON true
    WHERE ${istRangeSql('att."timestamp"', "$1", "$1")}
    ${enabled ? `AND NOT EXISTS (SELECT 1 FROM "CheckInAttempt" a2 WHERE a2."attendanceId" = att."id" AND a2."latitude" IS NOT NULL)` : ""}`);

  const rows = await query<MapPoint>(
    `SELECT * FROM (${parts.join(" UNION ALL ")}) x ORDER BY x.ts DESC LIMIT $2`,
    [day, MAP_CAP + 1],
  );
  const capped = rows.length > MAP_CAP;
  return { points: capped ? rows.slice(0, MAP_CAP) : rows, capped, attemptsEnabled: enabled };
}

export async function getTrail(
  code: string,
  day: string,
): Promise<{ trail: TrailPoint[]; gaps: TrackingGap[]; capped: boolean }> {
  const rows = await query<TrailPoint>(
    `SELECT ${msSql('lp."timestamp"')} AS ts, lp."latitude"::float8 AS lat, lp."longitude"::float8 AS lng, lp."accuracy"::float8 AS acc
     FROM "LocationPing" lp JOIN "User" u ON u."id" = lp."userId"
     WHERE u."employeeCode" = $1 AND ${istRangeSql('lp."timestamp"', "$2", "$2")}
     ORDER BY lp."timestamp" ASC LIMIT $3`,
    [code, day, MAP_CAP + 1],
  );
  const capped = rows.length > MAP_CAP;
  const trail = capped ? rows.slice(0, MAP_CAP) : rows;
  const gaps: TrackingGap[] = [];
  for (let i = 1; i < trail.length; i++) {
    const d = trail[i].ts - trail[i - 1].ts;
    if (d > GAP_MS) gaps.push({ fromTs: trail[i - 1].ts, toTs: trail[i].ts, minutes: Math.round(d / 60000), fromIdx: i - 1 });
  }
  return { trail, gaps, capped };
}
