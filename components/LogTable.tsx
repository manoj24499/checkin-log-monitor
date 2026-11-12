import Link from "next/link";
import type { LogRow } from "@/lib/queries/log";
import { fmtDateTime, istDay } from "@/lib/time";
import { qs } from "@/lib/params";
import { Badge, EmployeeLink, FailedFacePhoto, FaceBadge, OutcomeBadge, TableWrap } from "./ui";

export default function LogTable({ rows }: { rows: LogRow[] }) {
  return (
    <TableWrap>
      <table className="tbl">
        <thead>
          <tr>
            <th>Time (IST)</th><th>Employee</th><th>Action</th><th>Outcome</th><th>Reason</th><th>Mode</th>
            <th>Source</th><th>Net</th><th>Face</th><th>Late</th><th>Location</th><th>IP</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={12} className="py-6 text-center text-slate-500">No records for this filter.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.rid}`}>
              <td className="whitespace-nowrap">{fmtDateTime(r.ts)}</td>
              <td className="whitespace-nowrap"><EmployeeLink code={r.code} name={r.name} /></td>
              <td className="whitespace-nowrap">{r.action === "CHECK_IN" ? "Check-in" : r.action === "CHECK_OUT" ? "Check-out" : "Unknown"}</td>
              <td><OutcomeBadge outcome={r.outcome} /></td>
              <td className="min-w-40 max-w-64">
                {r.reasonCode && <div className="font-mono text-xs">{r.reasonCode}</div>}
                {r.reason && <div className="text-xs text-slate-500 break-words">{r.reason}</div>}
                {r.reasonCode === "FACE_MISMATCH" && r.kind === "attempt" && (
                  <div className="mt-1 flex items-center gap-2">
                    <FailedFacePhoto attemptId={r.rid} hasPhoto={r.aHasPhoto} sim={r.sim} caption={r.code ?? undefined} />
                    <Badge tone="red">Failed verification</Badge>
                  </div>
                )}
              </td>
              <td>{r.mode ? r.mode.toLowerCase() : "-"}</td>
              <td>{r.source ?? "-"}</td>
              <td>{r.offline ? <Badge tone="orange">offline</Badge> : <span className="text-slate-500">online</span>}</td>
              <td><FaceBadge status={r.face} sim={r.sim} /></td>
              <td>{r.late ? `${r.late}m` : "-"}</td>
              <td className="whitespace-nowrap">
                {r.lat != null && r.lng != null ? (
                  <Link className="text-accent-dark hover:underline" href={`/map${qs({ date: istDay(r.ts), pt: r.rid })}`}>
                    {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                  </Link>
                ) : "-"}
                {r.mocked && <div><Badge tone="red">mocked</Badge></div>}
              </td>
              <td className="whitespace-nowrap font-mono text-xs">{r.ip ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
