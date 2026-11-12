// Shared types/helpers for AttendanceEvent rows and forensic descriptions.
import { fmtTime, hhmm12 } from "./time";

export interface AttEvent {
  id: string;
  ts: number;
  userId: string;
  attendanceId: string | null;
  kind: string;
  actor: string;
  summary: string;
  detail: Record<string, unknown> | null;
}

export const EVENTS_NOTICE =
  "Automatic-action log not enabled yet - apply migration 20261113000000_attendance_events on the server (and re-run scripts/create-readonly-role.sql).";
export const APP_INFO_NOTICE =
  "App version / phone details are not recorded yet - apply migration 20261113000000_attendance_events on the server.";

/** true = delivered, false = NOT delivered / no device, null = unknown. */
export function deliveredOf(ev: AttEvent): boolean | null {
  const s = (ev.summary ?? "").toLowerCase();
  if (s.includes("not delivered") || s.includes("no device")) return false;
  const d = ev.detail?.delivered;
  if (typeof d === "number") return d > 0;
  if (typeof d === "boolean") return d;
  if (s.includes("delivered")) return true;
  return null;
}

/** Render a detail value that may be an ISO timestamp, an HH:mm string or a number. */
export function whenOf(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return fmtTime(v);
  if (typeof v !== "string" || !v) return null;
  if (/^\d{1,2}:\d{2}$/.test(v)) return hhmm12(v);
  const t = Date.parse(v);
  return Number.isNaN(t) ? v : fmtTime(t);
}

export function msOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}Z`);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

export function triggerText(t: unknown): string {
  switch (t) {
    case "SHIFT_END": return "the shift end passed while the employee was still checked in";
    case "OVERTIME_END": return "the approved overtime end passed";
    case "PERMISSION_END": return "a timed permission ran through the shift end";
    case "STALE_PREVIOUS_DAY": return "a session from a previous day was still open";
    default: return typeof t === "string" && t ? `trigger ${t}` : "trigger not recorded";
  }
}

export function howText(a: { source: string | null; clientAction: string | null; offline: boolean }): string {
  if ((a.source ?? "").toUpperCase() === "KIOSK") return "Kiosk";
  if (a.clientAction === "OFFLINE_SYNC" || a.offline) return "Sent from offline queue";
  if (a.clientAction === "SLIDE_TO_CONFIRM") return "Swiped with the app's slide button";
  return "Unknown (older app)";
}

export function appInfo(a: { appVersion: string | null; platform: string | null; osVersion: string | null; deviceModel: string | null }): string {
  const parts = [
    a.appVersion ? `app ${a.appVersion}` : null,
    a.deviceModel,
    a.platform ? `${a.platform}${a.osVersion ? ` ${a.osVersion}` : ""}` : a.osVersion,
  ].filter(Boolean);
  return parts.join(", ");
}

export interface ShiftInfo {
  weekday: number;
  name: string | null;
  start: string;
  end: string;
  updatedAt: number | null;
}
