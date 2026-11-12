import type { ShiftInfo } from "./events";
import { WEEKDAYS, fmtDateTime, hhmm12, istDay, istMs, addDaysSafe, weekdayOf } from "./time";

const TOL = 10 * 60000;

/** Best-effort explanation for an AUTO check-out that has no AttendanceEvent row (older logging). */
export function likelyCause(
  outTs: number,
  inTs: number | null,
  shifts: ShiftInfo[],
  permEnds: number[] = [],
  otEnds: number[] = [],
): string {
  const inDay = istDay(inTs ?? outTs);
  const wd = weekdayOf(inDay);
  const shift = shifts.find((s) => s.weekday === wd);
  const parts: string[] = [];
  if (shift) {
    let end = istMs(inDay, shift.end);
    if (shift.end <= shift.start) end = istMs(addDaysSafe(inDay, 1), shift.end);
    const d = outTs - end;
    const label = `Shift${shift.name ? ` '${shift.name}'` : ""} ${hhmm12(shift.start)}-${hhmm12(shift.end)} on ${WEEKDAYS[wd]}`;
    if (Math.abs(d) <= TOL) parts.push(`Likely cause: the check-out time equals the assigned shift end (${label}).`);
    else parts.push(`The check-out time does NOT match the assigned shift end (${label}); it was ${Math.round(Math.abs(d) / 60000)} min ${d < 0 ? "before" : "after"} it.`);
    if (shift.updatedAt) parts.push(`This assignment was last changed ${fmtDateTime(shift.updatedAt)}.`);
  } else {
    parts.push(`No shift is assigned for ${WEEKDAYS[wd]}.`);
  }
  if (otEnds.some((t) => Math.abs(t - outTs) <= TOL)) parts.push("It also matches an overtime request end time.");
  if (permEnds.some((t) => Math.abs(t - outTs) <= TOL)) parts.push("It also matches a timed permission end time.");
  const dayEnd = istMs(addDaysSafe(inDay, 1), "00:00");
  if (outTs >= dayEnd - TOL) parts.push("It is at or after the end of the day (end-of-day sweep).");
  return parts.join(" ");
}
