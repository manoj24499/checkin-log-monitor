import { isMissing, query } from "../db";
import { likelyCause } from "../cause";
import {
  APP_INFO_NOTICE, EVENTS_NOTICE, appInfo, deliveredOf, howText, msOf, triggerText, whenOf, type AttEvent, type ShiftInfo,
} from "../events";
import { fmtDateTime, fmtTime, fmtTimeSec, istDay, istMs, msRangeSql, msSql, weekdayOf } from "../time";
import { EVENT_COLS } from "./autoCheckouts";
import { getShiftAssignments } from "./shifts";

export type Tone = "green" | "red" | "amber" | "blue" | "slate" | "orange";

export interface FeedItem {
  key: string;
  ts: number;
  kind: string;
  icon: string;
  tone: Tone;
  title: string;
  line: string;
  detail?: unknown;
  nextDay: boolean;
}

export interface HowLine {
  ts: number;
  action: "CHECK_IN" | "CHECK_OUT";
  text: string;
  tone: Tone;
  warning: string | null; // red chip text
}

interface Att {
  id: string; type: "CHECK_IN" | "CHECK_OUT"; method: string; ts: number; late: number | null; face: string; sim: number | null;
  mode: string | null; offline: boolean; offlineVerified: boolean | null; outside: boolean;
  manualReason: string | null; manualBy: string | null; receivedAt: number | null;
}
interface Attempt {
  id: string; ts: number; action: string; outcome: string; reasonCode: string | null; reason: string | null; source: string | null;
  offline: boolean; ip: string | null; lat: number | null; lng: number | null; mocked: boolean | null; mode: string | null;
  face: string | null; sim: number | null; attId: string | null; hasPhoto: boolean;
  appVersion: string | null; platform: string | null; osVersion: string | null; deviceModel: string | null; clientAction: string | null;
}
interface Pause { id: string; attId: string; pausedAt: number; resumedAt: number | null; permId: string | null; permStart: number | null; permEnd: number | null }
interface Seg { id: string; attId: string; mode: string; startedAt: number; endedAt: number | null; startMethod: string; heading: string | null }
interface Perm { id: string; attId: string; createdAt: number; startTime: number; endTime: number; status: string; reviewedAt: number | null; reviewedBy: string | null }
interface Ot { id: string; attId: string; createdAt: number; estEnd: number; reason: string; status: string; reviewedAt: number | null; reviewedBy: string | null; submittedAt: number | null }

export interface DayData {
  day: string;
  windowStart: number;
  windowEnd: number;
  extended: boolean;
  feed: FeedItem[];
  how: HowLine[];
  shift: ShiftInfo | null;
  pingCount: number;
  notices: string[];
}

async function safe<T>(notices: string[], notice: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isMissing(e)) throw e;
    if (!notices.includes(notice)) notices.push(notice);
    return fallback;
  }
}

const actionWord = (a: string) => (a === "CHECK_IN" ? "check-in" : a === "CHECK_OUT" ? "check-out" : "attempt");
const loc = (lat: number | null, lng: number | null) => (lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null);

export async function getDay(userId: string, code: string, day: string): Promise<DayData> {
  const notices: string[] = [];
  const S = istMs(day, "00:00");
  const E = S + 86400000;

  // 1. Attendance around the day (to pair overnight shifts and find the spill-over).
  const attAll = await query<Att>(
    `SELECT a."id", a."type"::text AS type, a."method"::text AS method, ${msSql('a."timestamp"')} AS ts, a."lateMinutes"::int AS late,
            a."faceVerifyStatus"::text AS face, a."faceSimilarity"::float8 AS sim, a."checkInMode"::text AS mode,
            COALESCE(a."recordedOffline", false) AS offline, a."offlineTimeVerified" AS "offlineVerified",
            COALESCE(a."offlineOutsideArea", false) AS outside, a."manualReason" AS "manualReason",
            a."manualApprovedByName" AS "manualBy", ${msSql('a."offlineReceivedAt"')} AS "receivedAt"
     FROM "Attendance" a
     WHERE a."userId" = $1 AND ${msRangeSql('a."timestamp"', "$2", "$3")}
     ORDER BY a."timestamp" ASC, a."id" ASC LIMIT 500`,
    [userId, S - 86400000, E + 86400000],
  );

  // Pair check-outs to the nearest earlier unpaired check-in.
  const pairIn = new Map<string, Att>(); // checkOutId -> checkIn
  const pairOut = new Map<string, Att>(); // checkInId -> checkOut
  const open: Att[] = [];
  for (const r of attAll) {
    if (r.type === "CHECK_IN") open.push(r);
    else {
      const last = open[open.length - 1];
      if (last && r.ts - last.ts <= 24 * 3600000) {
        open.pop();
        pairIn.set(r.id, last);
        pairOut.set(last.id, r);
      }
    }
  }
  let end = E;
  for (const r of attAll) {
    if (r.type === "CHECK_IN" && r.ts >= S && r.ts < E) {
      const o = pairOut.get(r.id);
      if (o && o.ts >= E) end = Math.max(end, o.ts + 30 * 60000);
    }
  }
  end = Math.min(end, E + 24 * 3600000);
  const extended = end > E;
  const w = [S, end];

  const attInWin = attAll.filter((a) => a.ts >= S && a.ts < end);

  // 2. Everything else in the window.
  const attempts = await (async (): Promise<Attempt[]> => {
    const sel = (withNew: boolean) => `
      SELECT a."id", ${msSql('a."createdAt"')} AS ts, a."action"::text AS action, a."outcome"::text AS outcome,
             a."reasonCode"::text AS "reasonCode", a."reason"::text AS reason, a."source"::text AS source,
             COALESCE(a."offline", false) AS offline, a."ipAddress"::text AS ip, a."latitude"::float8 AS lat, a."longitude"::float8 AS lng,
             a."mocked" AS mocked, a."checkInMode"::text AS mode, a."faceVerifyStatus"::text AS face, a."faceSimilarity"::float8 AS sim,
             a."attendanceId" AS "attId", COALESCE(a."hasPhoto", false) AS "hasPhoto",
             ${withNew
               ? `a."appVersion" AS "appVersion", a."platform" AS platform, a."osVersion" AS "osVersion", a."deviceModel" AS "deviceModel", a."clientAction" AS "clientAction"`
               : `NULL::text AS "appVersion", NULL::text AS platform, NULL::text AS "osVersion", NULL::text AS "deviceModel", NULL::text AS "clientAction"`}
      FROM "CheckInAttempt" a
      WHERE (a."userId" = $1 OR a."employeeCode" = $4) AND ${msRangeSql('a."createdAt"', "$2", "$3")}
      ORDER BY a."createdAt" ASC LIMIT 500`;
    const run = (withNew: boolean) => query<Attempt>(sel(withNew), [userId, w[0], w[1], code]);
    try {
      return await run(true);
    } catch (e) {
      const c = (e as { code?: string }).code;
      if (c === "42703") {
        notices.push(APP_INFO_NOTICE);
        return safe(notices, "Attempt log not enabled yet - apply migration 20261112000000_checkin_attempt_log on the server.", [], () => run(false));
      }
      if (!isMissing(e)) throw e;
      notices.push("Attempt log not enabled yet - apply migration 20261112000000_checkin_attempt_log on the server.");
      return [];
    }
  })();

  const [events, pauses, segs, perms, ots, pingTs, shiftRes] = await Promise.all([
    safe<AttEvent[]>(notices, EVENTS_NOTICE, [], () =>
      query<AttEvent>(
        `SELECT ${EVENT_COLS} FROM "AttendanceEvent" e
         WHERE e."userId" = $1 AND ${msRangeSql('e."createdAt"', "$2", "$3")} ORDER BY e."createdAt" ASC LIMIT 500`,
        [userId, w[0], w[1]],
      )),
    safe<Pause[]>(notices, "Pause data unavailable - re-run scripts/create-readonly-role.sql.", [], () =>
      query<Pause>(
        `SELECT p."id", p."attendanceId" AS "attId", ${msSql('p."pausedAt"')} AS "pausedAt", ${msSql('p."resumedAt"')} AS "resumedAt",
                p."timedPermissionId" AS "permId", ${msSql('t."startTime"')} AS "permStart", ${msSql('t."endTime"')} AS "permEnd"
         FROM "AttendancePause" p JOIN "Attendance" a ON a."id" = p."attendanceId"
         LEFT JOIN "TimedPermission" t ON t."id" = p."timedPermissionId"
         WHERE a."userId" = $1 AND (${msRangeSql('p."pausedAt"', "$2", "$3")} OR ${msRangeSql('p."resumedAt"', "$2", "$3")})
         ORDER BY p."pausedAt" LIMIT 200`,
        [userId, w[0], w[1]],
      )),
    safe<Seg[]>(notices, "Work-segment data unavailable - re-run scripts/create-readonly-role.sql.", [], () =>
      query<Seg>(
        `SELECT s."id", s."attendanceId" AS "attId", s."mode"::text AS mode, ${msSql('s."startedAt"')} AS "startedAt",
                ${msSql('s."endedAt"')} AS "endedAt", s."startMethod"::text AS "startMethod", s."heading"::text AS heading
         FROM "WorkSegment" s JOIN "Attendance" a ON a."id" = s."attendanceId"
         WHERE a."userId" = $1 AND ${msRangeSql('s."startedAt"', "$2", "$3")} ORDER BY s."startedAt" LIMIT 200`,
        [userId, w[0], w[1]],
      )),
    safe<Perm[]>(notices, "Permission data unavailable - re-run scripts/create-readonly-role.sql.", [], () =>
      query<Perm>(
        `SELECT t."id", t."attendanceId" AS "attId", ${msSql('t."createdAt"')} AS "createdAt", ${msSql('t."startTime"')} AS "startTime",
                ${msSql('t."endTime"')} AS "endTime", t."approvalStatus"::text AS status, ${msSql('t."reviewedAt"')} AS "reviewedAt",
                t."reviewedByName" AS "reviewedBy"
         FROM "TimedPermission" t JOIN "Attendance" a ON a."id" = t."attendanceId"
         WHERE a."userId" = $1 AND (${msRangeSql('t."createdAt"', "$2", "$3")} OR ${msRangeSql('t."startTime"', "$2", "$3")})
         ORDER BY t."createdAt" LIMIT 100`,
        [userId, w[0], w[1]],
      )),
    safe<Ot[]>(notices, "Overtime data unavailable - re-run scripts/create-readonly-role.sql.", [], () =>
      query<Ot>(
        `SELECT o."id", o."attendanceId" AS "attId", ${msSql('o."createdAt"')} AS "createdAt", ${msSql('o."estimatedEndAt"')} AS "estEnd",
                o."reason" AS reason, o."status"::text AS status, ${msSql('o."reviewedAt"')} AS "reviewedAt",
                o."reviewedByName" AS "reviewedBy", ${msSql('o."submittedAt"')} AS "submittedAt"
         FROM "OvertimeRequest" o JOIN "Attendance" a ON a."id" = o."attendanceId"
         WHERE a."userId" = $1 AND (${msRangeSql('o."createdAt"', "$2", "$3")} OR ${msRangeSql('o."reviewedAt"', "$2", "$3")})
         ORDER BY o."createdAt" LIMIT 100`,
        [userId, w[0], w[1]],
      )),
    query<{ ts: number }>(
      `SELECT ${msSql('lp."timestamp"')} AS ts FROM "LocationPing" lp
       WHERE lp."userId" = $1 AND ${msRangeSql('lp."timestamp"', "$2", "$3")} ORDER BY lp."timestamp" ASC LIMIT 20000`,
      [userId, w[0], w[1]],
    ).then((r) => r.map((x) => x.ts)),
    getShiftAssignments([userId]),
  ]);
  if (shiftRes.missing) notices.push("Shift data unavailable - re-run scripts/create-readonly-role.sql.");
  const shifts = shiftRes.byUser.get(userId) ?? [];
  const shift = shifts.find((s) => s.weekday === weekdayOf(day)) ?? null;

  const firstEvent = await safe<number | null>(notices, EVENTS_NOTICE, null, async () => {
    const r = await query<{ ts: number | null }>(`SELECT ${msSql('min("createdAt")')} AS ts FROM "AttendanceEvent"`);
    return r[0]?.ts ?? null;
  });

  // ---- feed ----
  const feed: FeedItem[] = [];
  const push = (i: Omit<FeedItem, "nextDay" | "key"> & { key?: string }) =>
    feed.push({ ...i, key: i.key ?? `${i.kind}-${feed.length}`, nextDay: i.ts >= E });

  for (const a of attempts) {
    const how = howText(a);
    const ok = a.outcome === "SUCCESS";
    const bits = [
      how,
      appInfo(a) || null,
      a.ip ? `IP ${a.ip}` : null,
      loc(a.lat, a.lng) ? `location ${loc(a.lat, a.lng)}` : null,
      a.mocked ? "MOCK LOCATION" : null,
      a.face && a.face !== "NOT_CHECKED" ? `face ${a.face.toLowerCase()}${a.sim != null ? ` ${(a.sim * 100).toFixed(0)}%` : ""}` : null,
    ].filter(Boolean);
    push({
      key: `att-${a.id}`, ts: a.ts, kind: "ATTEMPT",
      icon: a.action === "CHECK_IN" ? "IN" : a.action === "CHECK_OUT" ? "OUT" : "?",
      tone: ok ? "green" : a.outcome === "REJECTED" ? "amber" : "red",
      title: `${actionWord(a.action)[0].toUpperCase()}${actionWord(a.action).slice(1)} attempt - ${ok ? "accepted" : a.outcome === "REJECTED" ? "REFUSED" : "ERROR"}${a.reasonCode ? ` (${a.reasonCode})` : ""}`,
      line: `${a.reason ? `${a.reason}. ` : ""}${bits.join(" · ")}`,
      detail: a,
    });
  }
  for (const r of attInWin) {
    push({
      key: `rec-${r.id}`, ts: r.ts, kind: "RECORD", icon: "REC", tone: "blue",
      title: `${r.type === "CHECK_IN" ? "Check-in" : "Check-out"} recorded (${r.method === "AUTO" ? "by the system" : r.method === "MANUAL" ? "entered by an admin" : "by the employee"})`,
      line: [
        r.mode ? `mode ${r.mode.toLowerCase()}` : null,
        r.late ? `late ${r.late} min` : null,
        r.offline ? `recorded offline${r.receivedAt ? `, received by server ${fmtTimeSec(r.receivedAt)}` : ""}${r.offlineVerified === false ? ", phone clock NOT verified" : ""}${r.outside ? ", OUTSIDE allowed area" : ""}` : null,
        r.manualBy ? `approved by ${r.manualBy}` : null,
        r.manualReason ? `reason: ${r.manualReason}` : null,
      ].filter(Boolean).join(" · "),
      detail: r,
    });
  }
  for (const e of events) {
    const del = e.kind === "PUSH_SENT" ? deliveredOf(e) : null;
    const meta: Record<string, { icon: string; tone: Tone; title: string }> = {
      AUTO_CHECKOUT: { icon: "AUTO", tone: "red", title: "System checked the employee out automatically" },
      AUTO_CHECKOUT_WARNING: { icon: "WARN", tone: "amber", title: "System warned the employee they are still checked in" },
      MANUAL_ENTRY: { icon: "ADM", tone: "slate", title: "Admin entered this day manually" },
      PUSH_SENT: { icon: "PUSH", tone: del === false ? "red" : "blue", title: `Notification sent${del === false ? " - NOT delivered" : del ? " - delivered" : ""}` },
    };
    const m = meta[e.kind] ?? { icon: "EVT", tone: "slate" as Tone, title: e.kind };
    const extra = e.kind === "PUSH_SENT" && e.detail ? [e.detail.title, e.detail.body].filter((x) => typeof x === "string").join(": ") : "";
    push({ key: `ev-${e.id}`, ts: e.ts, kind: e.kind, icon: m.icon, tone: m.tone, title: m.title, line: `${e.summary}${extra ? ` (${extra})` : ""}`, detail: e.detail });
  }
  for (const p of pauses) {
    const linked = p.permId ? ` (timed permission ${fmtTime(p.permStart)}-${fmtTime(p.permEnd)})` : " (left the work area)";
    if (p.pausedAt >= S && p.pausedAt < end) push({ key: `pa-${p.id}`, ts: p.pausedAt, kind: "PAUSE", icon: "II", tone: "amber", title: "Working time paused", line: `Paused${linked}`, detail: p });
    if (p.resumedAt && p.resumedAt >= S && p.resumedAt < end) push({ key: `pr-${p.id}`, ts: p.resumedAt, kind: "RESUME", icon: "GO", tone: "green", title: "Working time resumed", line: `Resumed${linked}`, detail: p });
  }
  for (const s of segs) {
    push({
      key: `sg-${s.id}`, ts: s.startedAt, kind: "SEGMENT", icon: "SEG", tone: "slate",
      title: `Work mode: ${s.mode.toLowerCase()}`,
      line: `Started by ${s.startMethod.toLowerCase()}${s.heading ? `, heading ${s.heading.toLowerCase()}` : ""}${s.endedAt ? `, ended ${fmtTimeSec(s.endedAt)}` : ", still open"}`,
      detail: s,
    });
  }
  for (const p of perms) {
    push({ key: `pm-${p.id}`, ts: p.createdAt, kind: "PERMISSION", icon: "PERM", tone: "orange", title: `Timed permission requested ${fmtTime(p.startTime)}-${fmtTime(p.endTime)}`, line: `Status ${p.status.toLowerCase()}`, detail: p });
    if (p.reviewedAt) push({ key: `pmr-${p.id}`, ts: p.reviewedAt, kind: "PERMISSION", icon: "PERM", tone: p.status === "REJECTED" ? "red" : "green", title: `Permission ${p.status.toLowerCase()}${p.reviewedBy ? ` by ${p.reviewedBy}` : ""}`, line: `For ${fmtTime(p.startTime)}-${fmtTime(p.endTime)}`, detail: p });
  }
  for (const o of ots) {
    push({ key: `ot-${o.id}`, ts: o.submittedAt ?? o.createdAt, kind: "OVERTIME", icon: "OT", tone: "orange", title: `Overtime requested until ${fmtTime(o.estEnd)}`, line: `Reason: ${o.reason} · status ${o.status.toLowerCase()}`, detail: o });
    if (o.reviewedAt) push({ key: `otr-${o.id}`, ts: o.reviewedAt, kind: "OVERTIME", icon: "OT", tone: o.status === "REJECTED" ? "red" : "green", title: `Overtime ${o.status.toLowerCase()}${o.reviewedBy ? ` by ${o.reviewedBy}` : ""}`, line: `Until ${fmtTime(o.estEnd)}`, detail: o });
  }

  // Location pings: summary, per hour, gaps (only while inside a session).
  const sessions: [number, number][] = [];
  for (const a of attAll) {
    if (a.type !== "CHECK_IN") continue;
    const o = pairOut.get(a.id);
    sessions.push([a.ts, o ? o.ts : Math.min(end, Date.now())]);
  }
  const inSession = (a: number, b: number) => sessions.some(([s, e2]) => a >= s - 60000 && b <= e2 + 60000);
  if (pingTs.length) {
    const perHour = new Map<string, number>();
    for (const t of pingTs) {
      const h = `${istDay(t)} ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: true }).format(new Date(t))}`;
      perHour.set(h, (perHour.get(h) ?? 0) + 1);
    }
    const hourLine = [...perHour.entries()].map(([h, n]) => `${h.slice(11)}: ${n}`).join(", ");
    push({ key: "ping-first", ts: pingTs[0], kind: "PING", icon: "GPS", tone: "slate", title: "First location ping", line: `${pingTs.length} pings in total. Per hour - ${hourLine}`, detail: Object.fromEntries(perHour) });
    if (pingTs.length > 1) push({ key: "ping-last", ts: pingTs[pingTs.length - 1], kind: "PING", icon: "GPS", tone: "slate", title: "Last location ping", line: "", detail: undefined });
    for (let i = 1; i < pingTs.length; i++) {
      const d = pingTs[i] - pingTs[i - 1];
      if (d > 15 * 60000 && inSession(pingTs[i - 1], pingTs[i])) {
        push({
          key: `gap-${i}`, ts: pingTs[i - 1], kind: "GAP", icon: "GAP", tone: "red",
          title: `No location received for ${Math.round(d / 60000)} min`,
          line: `From ${fmtTimeSec(pingTs[i - 1])} to ${fmtTimeSec(pingTs[i])}`, detail: { from: pingTs[i - 1], to: pingTs[i] },
        });
      }
    }
  }
  feed.sort((a, b) => a.ts - b.ts || a.key.localeCompare(b.key));

  // ---- "how did each check-in / check-out happen" ----
  const how: HowLine[] = [];
  for (const r of attInWin) {
    const att = attempts.find((a) => a.attId === r.id && a.outcome === "SUCCESS");
    const at = fmtTime(r.ts);
    const word = r.type === "CHECK_IN" ? "Checked in" : "Checked out";
    const coords = att ? loc(att.lat, att.lng) : null;
    let text: string;
    let tone: Tone = "green";
    let warning: string | null = null;

    if (r.method === "MANUAL") {
      const ev = events.find((e) => e.kind === "MANUAL_ENTRY" && (e.attendanceId === r.id || Math.abs(e.ts - r.ts) < 6 * 3600000));
      const by = (ev?.detail?.approvedBy as string | undefined) ?? r.manualBy ?? "an admin";
      const why = (ev?.detail?.reason as string | undefined) ?? r.manualReason;
      text = `${word} at ${at} - entered by admin ${by}${why ? `: ${why}` : ""}.`;
      tone = "slate";
    } else if (r.method === "AUTO") {
      tone = "red";
      const ev = events.find((e) => e.kind === "AUTO_CHECKOUT" && e.detail?.checkOutId === r.id);
      const inRec = pairIn.get(r.id) ?? null;
      if (r.type === "CHECK_OUT" && ev) {
        const d = ev.detail ?? {};
        const trig = d.trigger;
        const shiftBit = d.shiftName || d.shiftStart || d.shiftEnd
          ? ` (Shift${d.shiftName ? ` '${d.shiftName}'` : ""} ${whenOf(d.shiftStart) ?? "?"}-${whenOf(d.shiftEnd) ?? "?"})` : "";
        const target = whenOf(d.target);
        const warnMs = msOf(d.warnedAt) ?? events.filter((e) => e.kind === "AUTO_CHECKOUT_WARNING" && e.ts <= ev.ts).slice(-1)[0]?.ts ?? null;
        let warnText = "no warning was logged before the check-out";
        if (warnMs != null) {
          const push2 = events.find((e) => e.kind === "PUSH_SENT" && e.ts >= warnMs - 60000 && e.ts <= warnMs + 5 * 60000);
          const dl = push2 ? deliveredOf(push2) : null;
          warnText = `warned at ${fmtTime(warnMs)} (notification ${dl === true ? "delivered" : dl === false ? "NOT delivered" : "delivery unknown"})`;
        }
        text = `${word} at ${at} AUTOMATICALLY by the system - ${triggerText(trig)}${target ? `, target ${target}` : ""}${shiftBit}, ${warnText}, system acted at ${fmtTime(msOf(d.ranAt) ?? ev.ts)}.`;
      } else if (r.type === "CHECK_OUT") {
        const permEnds = perms.map((p) => p.endTime);
        const otEnds = ots.filter((o) => o.status === "APPROVED").map((o) => o.estEnd);
        text = `${word} at ${at} AUTOMATICALLY (system). Details were not recorded before ${firstEvent ? fmtDateTime(firstEvent) : "logging was enabled"}. ${likelyCause(r.ts, inRec?.ts ?? null, shifts, permEnds, otEnds)}`;
      } else {
        text = `${word} at ${at} automatically by the system.`;
      }
      if (r.type === "CHECK_OUT") {
        const nextIn = attAll.find((a) => a.type === "CHECK_IN" && a.ts > r.ts)?.ts ?? Infinity;
        const later = pingTs.filter((t) => t > r.ts + 60000 && t < nextIn);
        const laterAtt = attempts.filter((a) => a.ts > r.ts + 1000 && a.ts < nextIn);
        const parts: string[] = [];
        if (later.length) parts.push(`${later.length} location ping(s) after it, last at ${fmtTime(later[later.length - 1])}`);
        if (laterAtt.length) parts.push(`${laterAtt.length} later check-in/out attempt(s), first at ${fmtTime(laterAtt[0].ts)}`);
        if (parts.length) warning = `Employee appeared to still be working after the automatic check-out: ${parts.join("; ")}.`;
      }
    } else {
      const base = `${word} at ${at}`;
      if (att) {
        const info = appInfo(att);
        const how0 = howText(att);
        const clause =
          how0 === "Kiosk" ? "at the kiosk"
          : how0 === "Sent from offline queue" ? "from the offline queue (saved on the phone, sent later)"
          : how0 === "Swiped with the app's slide button" ? "using the slide button"
          : "(app version not recorded - older app)";
        text = `${base} by the employee ${clause}${info ? ` (${info})` : ""}${coords ? ` at ${coords}` : ""}.`;
      } else {
        text = `${base} by the employee (PIN)${r.offline ? ", recorded offline" : ""}. No attempt record is available for this entry.`;
      }
    }
    how.push({ ts: r.ts, action: r.type, text, tone, warning });
  }

  return { day, windowStart: S, windowEnd: end, extended, feed, how, shift, pingCount: pingTs.length, notices };
}

