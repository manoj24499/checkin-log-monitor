import { attemptsEnabled, query } from "../db";
import { qs } from "../params";
import { fmtDateTime, istDay, istRangeSql, msSql, todayIST } from "../time";

export interface AlertRow {
  label: string;
  detail: string;
  href: string;
}
export interface Alert {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  count: number;
  href: string;
  rows: AlertRow[];
}
export interface AlertsResult {
  alerts: Alert[];
  attemptsEnabled: boolean;
}

export async function getAlerts(from: string, to: string): Promise<AlertsResult> {
  const enabled = await attemptsEnabled();
  const alerts: Alert[] = [];
  const range = (col: string) => istRangeSql(col, "$1", "$2");
  const base = { from, to };

  if (enabled) {
    const rej = await query<{ reasonCode: string | null; n: number }>(
      `SELECT COALESCE("reasonCode", 'OTHER') AS "reasonCode", count(*)::int AS n
       FROM "CheckInAttempt"
       WHERE "outcome" IN ('REJECTED','ERROR') AND ${range('"createdAt"')}
       GROUP BY 1 ORDER BY n DESC`,
      [from, to],
    );
    for (const r of rej) {
      const reason = r.reasonCode ?? "OTHER";
      alerts.push({
        id: `rej-${reason}`,
        title: `Rejected attempts: ${reason}`,
        severity: reason === "SERVER_ERROR" || reason === "MOCK_LOCATION" || reason === "FACE_MISMATCH" ? "high" : "medium",
        count: r.n,
        href: `/log${qs({ ...base, reason })}`,
        rows: [],
      });
    }

    const pins = await query<{ code: string; day: string; n: number }>(
      `SELECT "employeeCode" AS code, to_char(("createdAt" + interval '330 minutes')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
       FROM "CheckInAttempt"
       WHERE "reasonCode" = 'INVALID_PIN' AND ${range('"createdAt"')}
       GROUP BY 1, 2 HAVING count(*) >= 3 ORDER BY n DESC, day DESC LIMIT 50`,
      [from, to],
    );
    if (pins.length)
      alerts.push({
        id: "repeat-pin",
        title: "Repeated failed PIN (3+ in a day, same employee code)",
        severity: "high",
        count: pins.length,
        href: `/log${qs({ ...base, reason: "INVALID_PIN" })}`,
        rows: pins.map((r) => ({
          label: `${r.code} - ${r.n} failed PINs`,
          detail: r.day,
          href: `/log${qs({ from: r.day, to: r.day, q: r.code, reason: "INVALID_PIN" })}`,
        })),
      });
  }

  const face = await query<{ id: string; ts: number; code: string; name: string; st: string; sim: number | null }>(
    `SELECT a."id", ${msSql('a."timestamp"')} AS ts, u."employeeCode" AS code, u."name" AS name,
            a."faceVerifyStatus"::text AS st, a."faceSimilarity"::float8 AS sim
     FROM "Attendance" a JOIN "User" u ON u."id" = a."userId"
     WHERE a."faceVerifyStatus"::text IN ('MISMATCH','UNAVAILABLE') AND ${range('a."timestamp"')}
     ORDER BY a."timestamp" DESC LIMIT 25`,
    [from, to],
  );
  const faceCount = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "Attendance" a
     WHERE a."faceVerifyStatus"::text IN ('MISMATCH','UNAVAILABLE') AND ${range('a."timestamp"')}`,
    [from, to],
  );
  if (faceCount[0]?.n)
    alerts.push({
      id: "face",
      title: "Face verification MISMATCH / UNAVAILABLE",
      severity: "high",
      count: faceCount[0].n,
      href: `/faces${qs({ ...base, status: "BAD" })}`,
      rows: face.map((r) => ({
        label: `${r.name} (${r.code}) - ${r.st}${r.sim != null ? ` ${(r.sim * 100).toFixed(0)}%` : ""}`,
        detail: fmtDateTime(r.ts),
        href: `/faces${qs({ from: istDay(r.ts), to: istDay(r.ts), q: r.code, status: "BAD" })}`,
      })),
    });

  // Checked in on a day that has since ended, with no later check-out.
  const today = todayIST();
  const open = await query<{ code: string; name: string; ts: number }>(
    `SELECT u."employeeCode" AS code, u."name" AS name, ${msSql('a."timestamp"')} AS ts
     FROM "Attendance" a JOIN "User" u ON u."id" = a."userId"
     WHERE a."type"::text = 'CHECK_IN' AND ${range('a."timestamp"')} AND a."dayKey" < $3
       AND NOT EXISTS (SELECT 1 FROM "Attendance" o WHERE o."userId" = a."userId" AND o."type"::text = 'CHECK_OUT' AND o."timestamp" > a."timestamp")
     ORDER BY a."timestamp" DESC LIMIT 50`,
    [from, to, today],
  );
  if (open.length)
    alerts.push({
      id: "no-checkout",
      title: "Checked in, no check-out after the day ended",
      severity: "medium",
      count: open.length,
      href: `/log${qs({ ...base, action: "CHECK_IN" })}`,
      rows: open.map((r) => ({
        label: `${r.name} (${r.code})`,
        detail: `checked in ${fmtDateTime(r.ts)}`,
        href: `/employees/${encodeURIComponent(r.code)}`,
      })),
    });

  const autos = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "Attendance" a
     WHERE a."method"::text = 'AUTO' AND a."type"::text = 'CHECK_OUT' AND ${range('a."timestamp"')}`,
    [from, to],
  );
  if (autos[0]?.n)
    alerts.push({
      id: "auto-out",
      title: "Auto check-outs",
      severity: "low",
      count: autos[0].n,
      href: `/log${qs({ ...base, source: "auto", action: "CHECK_OUT" })}`,
      rows: [],
    });

  const outside = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "Attendance" a
     WHERE a."recordedOffline" AND a."offlineOutsideArea" AND ${range('a."timestamp"')}`,
    [from, to],
  );
  if (outside[0]?.n)
    alerts.push({
      id: "offline-outside",
      title: "Offline records outside the allowed area",
      severity: "high",
      count: outside[0].n,
      href: `/log${qs({ ...base, offline: 1 })}`,
      rows: [],
    });

  const order = { high: 0, medium: 1, low: 2 } as const;
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  return { alerts, attemptsEnabled: enabled };
}
