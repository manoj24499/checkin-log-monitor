import Shell from "@/components/Shell";
import LiveRefresh from "@/components/LiveRefresh";
import LogTable from "@/components/LogTable";
import { ATTEMPT_NOTICE, Notice, PageHeader, Pager } from "@/components/ui";
import { intParam, qs, type SP } from "@/lib/params";
import { REASONS, parseLogFilters, queryLog } from "@/lib/queries/log";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function LogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = parseLogFilters(sp);
  const page = intParam(sp, "page", 1, 1, 2000);
  const { rows, attemptsEnabled } = await queryLog(f, PAGE + 1, (page - 1) * PAGE);
  const hasNext = rows.length > PAGE;

  const base = {
    from: f.from, to: f.to, q: f.q, action: f.action, outcome: f.outcome, reason: f.reason,
    face: f.face, source: f.source, offline: f.offline ? "1" : "",
  };

  return (
    <Shell>
      <PageHeader title="Activity log"><LiveRefresh /></PageHeader>
      {!attemptsEnabled && <Notice>{ATTEMPT_NOTICE}</Notice>}
      <form method="get" className="card mb-4 grid grid-cols-2 gap-2 p-3 md:grid-cols-4 lg:grid-cols-6">
        <label className="text-xs text-slate-600">From<input className="input w-full" type="date" name="from" defaultValue={f.from} /></label>
        <label className="text-xs text-slate-600">To<input className="input w-full" type="date" name="to" defaultValue={f.to} /></label>
        <label className="col-span-2 text-xs text-slate-600">Employee (code or name)<input className="input w-full" name="q" defaultValue={f.q} maxLength={60} /></label>
        <label className="text-xs text-slate-600">Action
          <select className="input w-full" name="action" defaultValue={f.action}>
            <option value="">All</option><option value="CHECK_IN">Check-in</option><option value="CHECK_OUT">Check-out</option>
          </select></label>
        <label className="text-xs text-slate-600">Outcome
          <select className="input w-full" name="outcome" defaultValue={f.outcome}>
            <option value="">All</option><option value="success">Success</option><option value="rejected">Rejected</option><option value="error">Error</option>
          </select></label>
        <label className="text-xs text-slate-600">Reason
          <select className="input w-full" name="reason" defaultValue={f.reason}>
            <option value="">All</option>{REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select></label>
        <label className="text-xs text-slate-600">Face
          <select className="input w-full" name="face" defaultValue={f.face}>
            <option value="">All</option><option value="MATCHED">Matched</option><option value="MISMATCH">Mismatch</option>
            <option value="UNAVAILABLE">Unavailable</option><option value="NOT_CHECKED">Not checked</option>
          </select></label>
        <label className="text-xs text-slate-600">Source
          <select className="input w-full" name="source" defaultValue={f.source}>
            <option value="">All</option><option value="app">App</option><option value="kiosk">Kiosk</option>
            <option value="auto">Auto</option><option value="manual">Manual</option>
          </select></label>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="offline" value="1" defaultChecked={f.offline} /> Offline only</label>
        <div className="flex items-end gap-2">
          <button className="btn" type="submit">Apply</button>
          <a className="btn-ghost" href="/log">Reset</a>
        </div>
      </form>
      <div className="mb-2 flex justify-end">
        <a className="btn-ghost" href={`/api/export/log${qs(base)}`}>Download CSV (max 20,000 rows)</a>
      </div>
      <LogTable rows={rows.slice(0, PAGE)} />
      <Pager path="/log" base={base} page={page} hasNext={hasNext} />
    </Shell>
  );
}
