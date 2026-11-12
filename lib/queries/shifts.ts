import { isMissing, query } from "../db";
import type { ShiftInfo } from "../events";

/** Shift assignments (one row per weekday) for the given users. Empty + missing=true if tables aren't readable. */
export async function getShiftAssignments(userIds: string[]): Promise<{ byUser: Map<string, ShiftInfo[]>; missing: boolean }> {
  const byUser = new Map<string, ShiftInfo[]>();
  if (userIds.length === 0) return { byUser, missing: false };
  try {
    const rows = await query<{ userId: string; weekday: number; name: string | null; start: string; end: string; updatedAt: number | null }>(
      `SELECT sa."userId", sa."weekday"::int AS weekday, s."name", s."startTime" AS start, s."endTime" AS end,
              (extract(epoch from sa."updatedAt") * 1000)::float8 AS "updatedAt"
       FROM "ShiftAssignment" sa JOIN "Shift" s ON s."id" = sa."shiftId"
       WHERE sa."userId" = ANY($1::text[])
       ORDER BY sa."weekday"`,
      [userIds],
    );
    for (const r of rows) {
      const arr = byUser.get(r.userId) ?? [];
      arr.push({ weekday: r.weekday, name: r.name, start: r.start, end: r.end, updatedAt: r.updatedAt });
      byUser.set(r.userId, arr);
    }
    return { byUser, missing: false };
  } catch (e) {
    if (!isMissing(e)) throw e;
    return { byUser, missing: true };
  }
}
