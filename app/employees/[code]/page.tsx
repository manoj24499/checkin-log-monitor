import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import LogTable from "@/components/LogTable";
import PhotoThumb, { PhotoExpired } from "@/components/PhotoThumb";
import { ATTEMPT_NOTICE, Badge, FaceBadge, Notice, PageHeader, TableWrap } from "@/components/ui";
import { rangeParams, qs, type SP } from "@/lib/params";
import { getEmployee, getUserPhotos, getUserRecords, pairShifts } from "@/lib/queries/employees";
import { parseLogFilters, queryLog } from "@/lib/queries/log";
import { queryFailedAttempts } from "@/lib/queries/faces";
import { attemptsEnabled } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtDuration, fmtTime, istDay } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<SP>;
}) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).slice(0, 64);
  const sp = await searchParams;
  const { from, to } = rangeParams(sp, 13);

  const emp = await getEmployee(code);
  if (!emp) notFound();

  const enabled = await attemptsEnabled();
  const [recs, photos, log, failed] = await Promise.all([
    getUserRecords(emp.id, from, to),
    getUserPhotos(emp.id, from, to),
    queryLog({ ...parseLogFilters({}), from, to, code: emp.code, outcome: enabled ? "" : "success" }, 200, 0),
    enabled ? queryFailedAttempts({ from, to, q: emp.code, status: "ALL", threshold: 100 }, 12) : Promise.resolve([]),
  ]);

  const shifts = pairShifts(recs, istDay).filter((s) => s.day >= from && s.day <= to);
  const byDay = new Map<string, typeof shifts>();
  for (const s of shifts) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
  const days = [...byDay.keys()].sort().reverse();
  const failedOwn = failed.filter((f) => f.code === emp.code);

  return (
    <Shell>
      <PageHeader title={`${emp.name} (${emp.code})`} />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Badge tone="blue">{emp.workMode.toLowerCase()}</Badge>
        <Badge tone={emp.face ? "green" : "slate"}>face verification {emp.face ? "on" : "off"}</Badge>
        {!emp.active && <Badge tone="slate">inactive</Badge>}
      </div>
      {!log.attemptsEnabled && <Notice>{ATTEMPT_NOTICE}</Notice>}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-600">From<input className="input block" type="date" name="from" defaultValue={from} /></label>
        <label className="text-xs text-slate-600">To<input className="input block" type="date" name="to" defaultValue={to} /></label>
        <button className="btn" type="submit">Apply</button>
        <Link className="btn-ghost" href={`/map${qs({ date: to, emp: emp.code })}`}>Map for {to}</Link>
      </form>

      <h2 className="mb-2 text-lg font-semibold">Timeline</h2>
      <TableWrap>
        <table className="tbl">
          <thead><tr><th>Day</th><th>Check-in</th><th>Check-out</th><th>Worked</th><th>Late</th><th>Face</th><th>Flags</th></tr></thead>
          <tbody>
            {days.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-500">No check-ins in this range.</td></tr>}
            {days.flatMap((d) =>
              byDay.get(d)!.map((s, i) => (
                <tr key={`${d}-${i}`}>
                  <td className="whitespace-nowrap">{i === 0 ? fmtDate(new Date(`${d}T06:00:00Z`).getTime()) : ""}</td>
                  <td className="whitespace-nowrap">{s.inRec ? fmtTime(s.inRec.ts) : <span className="text-slate-400">-</span>}</td>
                  <td className="whitespace-nowrap">
                    {s.outRec ? (
                      <>
                        {fmtTime(s.outRec.ts)}
                        {s.inRec && istDay(s.outRec.ts) !== d && <span className="ml-1 text-xs text-slate-500">(next day, {s.outRec.dayKey})</span>}
                        {s.outRec.method === "AUTO" && <span className="ml-1"><Badge tone="amber">auto</Badge></span>}
                      </>
                    ) : s.inRec ? <Badge tone="amber">no check-out</Badge> : "-"}
                  </td>
                  <td className="whitespace-nowrap">{s.workedMs != null ? fmtDuration(s.workedMs) : "-"}</td>
                  <td>{s.inRec?.late ? `${s.inRec.late}m` : "-"}</td>
                  <td>{s.inRec ? <FaceBadge status={s.inRec.face} sim={s.inRec.sim} /> : "-"}</td>
                  <td className="space-x-1">
                    {[s.inRec, s.outRec].some((r) => r?.offline) && <Badge tone="orange">offline</Badge>}
                    {[s.inRec, s.outRec].some((r) => r?.outside) && <Badge tone="red">outside area</Badge>}
                    {[s.inRec, s.outRec].some((r) => r?.offline && r.offlineVerified === false) && <Badge tone="amber">time unverified</Badge>}
                    {s.inRec?.mode && <Badge tone="slate">{s.inRec.mode.toLowerCase()}</Badge>}
                    {[s.inRec, s.outRec].some((r) => r?.method === "MANUAL") && <Badge tone="slate">manual</Badge>}
                    {s.inRec?.leave && s.inRec.leave !== "NONE" && <Badge tone="blue">{s.inRec.leave.toLowerCase().replace("_", " ")}</Badge>}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </TableWrap>
      <p className="mt-1 text-xs text-slate-500">Check-outs are paired with the nearest earlier unpaired check-in (up to 24 h earlier), so overnight shifts pair correctly.</p>

      {failedOwn.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-lg font-semibold">Failed face verification photos</h2>
          <div className="flex flex-wrap gap-3">
            {failedOwn.map((f) => (
              <div key={f.id} className="card p-2 text-center text-xs">
                {f.hasPhoto ? (
                  <PhotoThumb src={`/api/photo/attempt/${encodeURIComponent(f.id)}`} badge="Failed" caption={`Failed verification${f.sim != null ? ` - ${(f.sim * 100).toFixed(0)}%` : ""} - ${fmtDateTime(f.ts)}`} />
                ) : (
                  <PhotoExpired />
                )}
                <div className="mt-1">{fmtDateTime(f.ts)}</div>
                <div className="font-semibold text-red-700">Failed{f.sim != null ? ` ${(f.sim * 100).toFixed(0)}%` : ""}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="mb-2 mt-6 text-lg font-semibold">Recent photos</h2>
      {photos.length === 0 ? (
        <div className="text-sm text-slate-500">No stored photos in this range.</div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {photos.map((p) => (
            <div key={p.id} className="card p-2 text-center text-xs">
              <PhotoThumb src={`/api/photo/${encodeURIComponent(p.id)}`} caption={`${p.type === "CHECK_IN" ? "Check-in" : "Check-out"} ${fmtDateTime(p.ts)}`} />
              <div className="mt-1">{fmtDateTime(p.ts)}</div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-2 mt-6 text-lg font-semibold">All attempts and records</h2>
      <LogTable rows={log.rows} />
      <p className="mt-1 text-xs text-slate-500">Newest 200 in range. <Link className="text-accent-dark underline" href={`/log${qs({ from, to, q: emp.code })}`}>Open in activity log</Link></p>
    </Shell>
  );
}
