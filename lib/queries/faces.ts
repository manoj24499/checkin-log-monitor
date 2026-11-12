import { Params, query } from "../db";
import { likeEscape } from "../params";
import { istRangeSql, msSql } from "../time";

export interface FaceFilters {
  from: string;
  to: string;
  q: string;
  status: "ALL" | "BAD" | "MISMATCH" | "UNAVAILABLE" | "MATCHED" | "GAP" | "LOW";
  threshold: number; // percent
}

export interface FaceRow {
  id: string;
  ts: number;
  code: string;
  name: string;
  type: string;
  status: string;
  sim: number | null;
  hasPhoto: boolean;
  gap: boolean;
}

export interface FaceSummary {
  matched: number;
  mismatch: number;
  unavailable: number;
  gaps: number;
}

function where(f: FaceFilters, p: Params, withStatus: boolean): string {
  const w = [istRangeSql('a."timestamp"', p.add(f.from), p.add(f.to))];
  if (f.q) {
    const like = p.add(`%${likeEscape(f.q)}%`);
    w.push(`(u."employeeCode" ILIKE ${like} OR u."name" ILIKE ${like})`);
  }
  // A "gap": employee has face verification on, checked in, but it was never checked.
  const GAP = `(a."faceVerifyStatus"::text = 'NOT_CHECKED' AND a."type"::text = 'CHECK_IN' AND u."faceVerificationEnabled" AND u."role"::text = 'EMPLOYEE')`;
  const CHECKED = `a."faceVerifyStatus"::text <> 'NOT_CHECKED'`;
  if (!withStatus) {
    w.push(`(${CHECKED} OR ${GAP})`);
    return w.join(" AND ");
  }
  switch (f.status) {
    case "ALL": w.push(`(${CHECKED} OR ${GAP})`); break;
    case "BAD": w.push(`a."faceVerifyStatus"::text IN ('MISMATCH','UNAVAILABLE')`); break;
    case "MISMATCH": case "UNAVAILABLE": case "MATCHED": w.push(`a."faceVerifyStatus"::text = ${p.add(f.status)}`); break;
    case "GAP": w.push(GAP); break;
    case "LOW": w.push(`a."faceSimilarity" IS NOT NULL AND a."faceSimilarity" < ${p.add(f.threshold / 100)}`); break;
  }
  return w.join(" AND ");
}

export async function queryFaces(f: FaceFilters, limit: number, offset: number): Promise<FaceRow[]> {
  const p = new Params();
  const w = where(f, p, true);
  const sql = `
    SELECT a."id", ${msSql('a."timestamp"')} AS ts, u."employeeCode" AS code, u."name" AS name,
           a."type"::text AS type, a."faceVerifyStatus"::text AS status, a."faceSimilarity"::float8 AS sim,
           a."hasPhoto" AS "hasPhoto",
           (a."faceVerifyStatus"::text = 'NOT_CHECKED') AS gap
    FROM "Attendance" a JOIN "User" u ON u."id" = a."userId"
    WHERE ${w}
    ORDER BY a."timestamp" DESC, a."id" DESC
    LIMIT ${p.add(limit)} OFFSET ${p.add(offset)}`;
  return query<FaceRow>(sql, p.values);
}

export async function faceSummary(f: FaceFilters): Promise<FaceSummary> {
  const p = new Params();
  const w = where(f, p, false);
  const r = await query<FaceSummary>(
    `SELECT count(*) FILTER (WHERE a."faceVerifyStatus"::text = 'MATCHED')::int AS matched,
            count(*) FILTER (WHERE a."faceVerifyStatus"::text = 'MISMATCH')::int AS mismatch,
            count(*) FILTER (WHERE a."faceVerifyStatus"::text = 'UNAVAILABLE')::int AS unavailable,
            count(*) FILTER (WHERE a."faceVerifyStatus"::text = 'NOT_CHECKED')::int AS gaps
     FROM "Attendance" a JOIN "User" u ON u."id" = a."userId"
     WHERE ${w}`,
    p.values,
  );
  return r[0] ?? { matched: 0, mismatch: 0, unavailable: 0, gaps: 0 };
}

export interface FailedAttemptRow {
  id: string;
  ts: number;
  code: string;
  name: string | null;
  action: string;
  sim: number | null;
  hasPhoto: boolean;
}

/** Rejected attempts with reasonCode FACE_MISMATCH (photo lives on the attempt row; never selected here). */
export async function queryFailedAttempts(f: FaceFilters, limit: number): Promise<FailedAttemptRow[]> {
  const p = new Params();
  const w = [`a."reasonCode" = 'FACE_MISMATCH'`, istRangeSql('a."createdAt"', p.add(f.from), p.add(f.to))];
  if (f.q) {
    const like = p.add(`%${likeEscape(f.q)}%`);
    w.push(`(a."employeeCode" ILIKE ${like} OR u."name" ILIKE ${like})`);
  }
  if (f.status === "LOW") w.push(`a."faceSimilarity" IS NOT NULL AND a."faceSimilarity" < ${p.add(f.threshold / 100)}`);
  return query<FailedAttemptRow>(
    `SELECT a."id", ${msSql('a."createdAt"')} AS ts, a."employeeCode" AS code, u."name" AS name,
            a."action"::text AS action, a."faceSimilarity"::float8 AS sim, COALESCE(a."hasPhoto", false) AS "hasPhoto"
     FROM "CheckInAttempt" a LEFT JOIN "User" u ON u."id" = a."userId"
     WHERE ${w.join(" AND ")}
     ORDER BY a."createdAt" DESC LIMIT ${p.add(limit)}`,
    p.values,
  );
}
