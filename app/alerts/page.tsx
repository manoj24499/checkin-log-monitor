import Shell from "@/components/Shell";
import AlertList from "@/components/AlertList";
import { ATTEMPT_NOTICE, Notice, PageHeader } from "@/components/ui";
import { rangeParams, type SP } from "@/lib/params";
import { getAlerts } from "@/lib/queries/alerts";

export const dynamic = "force-dynamic";

export default async function AlertsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { from, to } = rangeParams(sp, 6);
  const { alerts, attemptsEnabled } = await getAlerts(from, to);
  return (
    <Shell>
      <PageHeader title="Alerts" />
      {!attemptsEnabled && <Notice>{ATTEMPT_NOTICE}</Notice>}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-600">From<input className="input block" type="date" name="from" defaultValue={from} /></label>
        <label className="text-xs text-slate-600">To<input className="input block" type="date" name="to" defaultValue={to} /></label>
        <button className="btn" type="submit">Apply</button>
      </form>
      <AlertList alerts={alerts} />
    </Shell>
  );
}
