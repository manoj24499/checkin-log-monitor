import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import DayFeed, { HowCard } from "@/components/DayFeed";
import { Badge, Notice, PageHeader } from "@/components/ui";
import { dateParam, qs, type SP } from "@/lib/params";
import { getEmployee } from "@/lib/queries/employees";
import { getDay } from "@/lib/queries/day";
import { WEEKDAYS, addDays, fmtDateTime, hhmm12, todayIST, weekdayOf } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DayPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).slice(0, 64);
  const sp = await searchParams;
  const day = dateParam(sp, "date", todayIST());
  const emp = await getEmployee(code);
  if (!emp) notFound();
  const d = await getDay(emp.id, emp.code, day);
  const base = `/employees/${encodeURIComponent(emp.code)}/day`;

  return (
    <Shell>
      <PageHeader title={`Day timeline - ${emp.name} (${emp.code})`} />
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Link className="btn-ghost" href={`${base}${qs({ date: addDays(day, -1) })}`}>Previous day</Link>
        <form method="get" className="flex items-end gap-2">
          <label className="text-xs text-slate-600">Date (IST)<input className="input block" type="date" name="date" defaultValue={day} /></label>
          <button className="btn" type="submit">Show</button>
        </form>
        <Link className="btn-ghost" href={`${base}${qs({ date: addDays(day, 1) })}`}>Next day</Link>
        <Link className="btn-ghost" href={`/employees/${encodeURIComponent(emp.code)}`}>Employee page</Link>
        <Link className="btn-ghost" href={`/map${qs({ date: day, emp: emp.code })}`}>Map</Link>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <Badge tone="blue">{emp.workMode.toLowerCase()}</Badge>
        <span>{WEEKDAYS[weekdayOf(day)]}</span>
        <span>
          Assigned shift:{" "}
          {d.shift ? <b>{d.shift.name ? `${d.shift.name} ` : ""}{hhmm12(d.shift.start)} - {hhmm12(d.shift.end)}</b> : <b>none</b>}
          {d.shift?.updatedAt ? ` (assignment last changed ${fmtDateTime(d.shift.updatedAt)})` : ""}
        </span>
        <span>{d.pingCount} location pings</span>
      </div>
      {d.notices.map((n) => <Notice key={n}>{n}</Notice>)}
      {d.extended && <Notice>This day includes the part of an overnight session that continues past midnight (items marked "next day").</Notice>}
      <HowCard lines={d.how} />
      <h2 className="mb-2 text-lg font-semibold">Chronological feed (IST)</h2>
      <DayFeed items={d.feed} />
    </Shell>
  );
}
