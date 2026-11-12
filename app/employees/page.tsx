import Shell from "@/components/Shell";
import { ATTEMPT_NOTICE, Badge, EmployeeLink, Notice, PageHeader, TableWrap } from "@/components/ui";
import { str, type SP } from "@/lib/params";
import { listEmployees } from "@/lib/queries/employees";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = str(sp, "q", 60);
  const { rows, attemptsEnabled } = await listEmployees(q);
  return (
    <Shell>
      <PageHeader title="Employees" />
      {!attemptsEnabled && <Notice>{ATTEMPT_NOTICE}</Notice>}
      <form method="get" className="mb-4 flex gap-2">
        <input className="input w-full max-w-sm" name="q" placeholder="Search name or code" defaultValue={q} maxLength={60} />
        <button className="btn" type="submit">Search</button>
      </form>
      <TableWrap>
        <table className="tbl">
          <thead><tr><th>Employee</th><th>Work mode</th><th>Face check</th><th>Last check-in (IST)</th><th>Rejected (7d)</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-500">No employees found.</td></tr>}
            {rows.map((r) => (
              <tr key={r.code}>
                <td><EmployeeLink code={r.code} name={r.name} />{!r.active && <span className="ml-2"><Badge tone="slate">inactive</Badge></span>}</td>
                <td>{r.workMode.toLowerCase()}</td>
                <td>{r.face ? "on" : "off"}</td>
                <td className="whitespace-nowrap">{fmtDateTime(r.lastIn)}</td>
                <td>{r.rejected7 == null ? "n/a" : r.rejected7 > 0 ? <Badge tone="amber">{r.rejected7}</Badge> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Shell>
  );
}
