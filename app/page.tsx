import Shell from "@/components/Shell";
import LiveRefresh from "@/components/LiveRefresh";
import AlertList from "@/components/AlertList";
import { ATTEMPT_NOTICE, Notice, PageHeader, Stat } from "@/components/ui";
import { dateParam, qs, type SP } from "@/lib/params";
import { getOverview } from "@/lib/queries/overview";
import { getAlerts } from "@/lib/queries/alerts";
import { todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const day = dateParam(sp, "date", todayIST());
  const [s, a] = await Promise.all([getOverview(day), getAlerts(day, day)]);
  const r = { from: day, to: day };

  return (
    <Shell>
      <PageHeader title="Overview">
        <LiveRefresh />
      </PageHeader>
      <form method="get" className="mb-4 flex items-end gap-2">
        <label className="text-xs text-slate-600">Date (IST)
          <input className="input block" type="date" name="date" defaultValue={day} />
        </label>
        <button className="btn" type="submit">Show</button>
        <a className="btn-ghost" href="/">Today</a>
      </form>
      <form method="get" action="/employees" className="mb-4 flex items-end gap-2">
        <label className="text-xs text-slate-600">Day timeline for employee code
          <input className="input block" name="q" placeholder="e.g. EMP001" maxLength={60} />
        </label>
        <input type="hidden" name="day" value={day} />
        <button className="btn-ghost" type="submit">Find</button>
      </form>
      {!s.attemptsEnabled && <Notice>{ATTEMPT_NOTICE}</Notice>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Checked in" value={s.checkedIn} href={`/log${qs({ ...r, action: "CHECK_IN", outcome: "success" })}`} />
        <Stat label="Checked out" value={s.checkedOut} href={`/log${qs({ ...r, action: "CHECK_OUT", outcome: "success" })}`} />
        <Stat label="Still working" value={s.stillWorking} href={`/log${qs({ ...r, action: "CHECK_IN", outcome: "success" })}`} />
        <Stat label="Late arrivals" value={s.late} tone={s.late ? "amber" : undefined} href={`/log${qs({ ...r, action: "CHECK_IN" })}`} />
        <Stat label="Face mismatches" value={s.faceMismatch} tone={s.faceMismatch ? "red" : undefined} href={`/faces${qs({ ...r, status: "MISMATCH" })}`} />
        <Stat label="Rejected attempts" value={s.rejected ?? "n/a"} tone={s.rejected ? "red" : undefined} href={`/log${qs({ ...r, outcome: "rejected" })}`} />
        <Stat label="Offline records" value={s.offline} href={`/log${qs({ ...r, offline: 1 })}`} />
        <Stat label="Auto / manual entries" value={s.autoManual} href={`/log${qs({ ...r, source: "auto" })}`} />
      </div>
      <h2 className="mb-2 mt-6 text-lg font-semibold">Needs attention</h2>
      <AlertList alerts={a.alerts} />
    </Shell>
  );
}
