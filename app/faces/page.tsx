import Shell from "@/components/Shell";
import PhotoThumb, { PhotoExpired } from "@/components/PhotoThumb";
import { ATTEMPT_NOTICE, Badge, EmployeeLink, FailedFacePhoto, FaceBadge, Notice, PageHeader, Pager, Stat, TableWrap } from "@/components/ui";
import { enumParam, intParam, qs, rangeParams, str, type SP } from "@/lib/params";
import { faceSummary, queryFaces, queryFailedAttempts, type FaceFilters } from "@/lib/queries/faces";
import { attemptsEnabled } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";
const PAGE = 40;
const STATUSES = ["ALL", "BAD", "MISMATCH", "UNAVAILABLE", "MATCHED", "GAP", "LOW"] as const;

export default async function FacesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { from, to } = rangeParams(sp, 6);
  const f: FaceFilters = {
    from, to,
    q: str(sp, "q", 60),
    status: enumParam(sp, "status", STATUSES, "ALL"),
    threshold: intParam(sp, "threshold", 60, 1, 100),
  };
  const page = intParam(sp, "page", 1, 1, 2000);
  const enabled = await attemptsEnabled();
  const showAttempts = enabled && ["ALL", "BAD", "MISMATCH", "LOW"].includes(f.status);
  const [rows, sum, failed] = await Promise.all([
    queryFaces(f, PAGE + 1, (page - 1) * PAGE),
    faceSummary(f),
    showAttempts && page === 1 ? queryFailedAttempts(f, 60) : Promise.resolve([]),
  ]);
  const hasNext = rows.length > PAGE;
  const base = { from, to, q: f.q, status: f.status, threshold: f.status === "LOW" ? f.threshold : "" };

  return (
    <Shell>
      <PageHeader title="Face verification" />
      {!enabled && <Notice>{ATTEMPT_NOTICE} Failed-verification photos are unavailable until then.</Notice>}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Matched" value={sum.matched} />
        <Stat label="Mismatch" value={sum.mismatch} tone={sum.mismatch ? "red" : undefined} />
        <Stat label="Unavailable" value={sum.unavailable} tone={sum.unavailable ? "amber" : undefined} />
        <Stat label="Gaps (face on, not checked)" value={sum.gaps} tone={sum.gaps ? "amber" : undefined} />
      </div>
      <form method="get" className="card mb-4 grid grid-cols-2 gap-2 p-3 md:grid-cols-6">
        <label className="text-xs text-slate-600">From<input className="input w-full" type="date" name="from" defaultValue={from} /></label>
        <label className="text-xs text-slate-600">To<input className="input w-full" type="date" name="to" defaultValue={to} /></label>
        <label className="text-xs text-slate-600">Employee<input className="input w-full" name="q" defaultValue={f.q} maxLength={60} /></label>
        <label className="text-xs text-slate-600">Status
          <select className="input w-full" name="status" defaultValue={f.status}>
            <option value="ALL">All (checked + gaps)</option><option value="BAD">Mismatch + unavailable</option>
            <option value="MISMATCH">Mismatch</option><option value="UNAVAILABLE">Unavailable</option>
            <option value="MATCHED">Matched</option><option value="GAP">Gaps (not checked)</option>
            <option value="LOW">Low similarity</option>
          </select></label>
        <label className="text-xs text-slate-600">Threshold % (low)
          <input className="input w-full" type="number" min={1} max={100} name="threshold" defaultValue={f.threshold} /></label>
        <div className="flex items-end gap-2"><button className="btn" type="submit">Apply</button><a className="btn-ghost" href="/faces">Reset</a></div>
      </form>

      {showAttempts && page === 1 && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Failed verification attempts (rejected)</h2>
          <TableWrap>
            <table className="tbl">
              <thead><tr><th>Photo</th><th>Time (IST)</th><th>Employee</th><th>Action</th><th>Result</th><th>Similarity</th></tr></thead>
              <tbody>
                {failed.length === 0 && <tr><td colSpan={6} className="py-5 text-center text-slate-500">No failed attempts in this range.</td></tr>}
                {failed.map((r) => (
                  <tr key={r.id}>
                    <td><FailedFacePhoto attemptId={r.id} hasPhoto={r.hasPhoto} sim={r.sim} caption={`${r.code} ${fmtDateTime(r.ts)}`} /></td>
                    <td className="whitespace-nowrap">{fmtDateTime(r.ts)}</td>
                    <td><EmployeeLink code={r.code} name={r.name} /></td>
                    <td>{r.action === "CHECK_IN" ? "Check-in" : r.action === "CHECK_OUT" ? "Check-out" : r.action}</td>
                    <td><Badge tone="red">Failed verification</Badge></td>
                    <td>{r.sim != null ? `${(r.sim * 100).toFixed(0)}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="mt-1 text-xs text-slate-500">Failed-attempt photos are deleted after the retention period; expired ones show a placeholder.</p>
        </section>
      )}

      <h2 className="mb-2 text-lg font-semibold">Accepted records</h2>
      <TableWrap>
        <table className="tbl">
          <thead><tr><th>Photo</th><th>Time (IST)</th><th>Employee</th><th>Action</th><th>Face</th><th>Similarity</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No records for this filter.</td></tr>}
            {rows.slice(0, PAGE).map((r) => (
              <tr key={r.id}>
                <td>
                  {r.hasPhoto ? (
                    <PhotoThumb src={`/api/photo/${encodeURIComponent(r.id)}`} caption={`${r.name} (${r.code}) - ${fmtDateTime(r.ts)}`} />
                  ) : (
                    <PhotoExpired />
                  )}
                </td>
                <td className="whitespace-nowrap">{fmtDateTime(r.ts)}</td>
                <td><EmployeeLink code={r.code} name={r.name} /></td>
                <td>{r.type === "CHECK_IN" ? "Check-in" : "Check-out"}</td>
                <td>{r.gap ? <Badge tone="amber">not checked (gap)</Badge> : <FaceBadge status={r.status} sim={r.sim} />}</td>
                <td>{r.sim != null ? `${(r.sim * 100).toFixed(1)}%` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pager path="/faces" base={base} page={page} hasNext={hasNext} />
      <span className="hidden">{qs({})}</span>
    </Shell>
  );
}
