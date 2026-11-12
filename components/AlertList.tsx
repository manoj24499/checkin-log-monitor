import Link from "next/link";
import type { Alert } from "@/lib/queries/alerts";
import { Badge } from "./ui";

const TONE = { high: "red", medium: "amber", low: "slate" } as const;

export default function AlertList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return <div className="card p-4 text-sm text-slate-500">Nothing needs attention for this period.</div>;
  return (
    <div className="space-y-3">
      {alerts.map((a) => (
        <div key={a.id} className="card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone={TONE[a.severity]}>{a.severity}</Badge>
              <Link href={a.href} className="font-semibold hover:text-accent-dark hover:underline">{a.title}</Link>
            </div>
            <Link href={a.href} className="btn-ghost !py-1">{a.count} - view</Link>
          </div>
          {a.rows.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {a.rows.map((r, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 py-1">
                  <Link href={r.href} className="text-accent-dark hover:underline">{r.label}</Link>
                  <span className="text-slate-500">{r.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
