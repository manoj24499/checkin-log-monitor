import type { FeedItem, HowLine } from "@/lib/queries/day";
import { fmtTimeSec } from "@/lib/time";

const BG: Record<string, string> = {
  green: "bg-green-600", red: "bg-red-600", amber: "bg-amber-500", blue: "bg-blue-600", slate: "bg-slate-500", orange: "bg-orange-500",
};
const BORDER: Record<string, string> = {
  green: "border-green-200", red: "border-red-300 bg-red-50/40", amber: "border-amber-200", blue: "border-blue-200", slate: "border-slate-200", orange: "border-orange-200",
};

export function HowCard({ lines }: { lines: HowLine[] }) {
  return (
    <div className="card mb-5 p-4">
      <h2 className="mb-2 text-lg font-semibold">How did each check-in / check-out happen?</h2>
      {lines.length === 0 ? (
        <p className="text-sm text-slate-500">No check-in or check-out records on this day.</p>
      ) : (
        <ul className="space-y-3">
          {lines.map((l, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className={`mt-0.5 h-6 shrink-0 rounded px-1.5 text-center text-[11px] font-bold leading-6 text-white ${BG[l.tone]}`}>
                {l.action === "CHECK_IN" ? "IN" : "OUT"}
              </span>
              <div className="min-w-0 break-words">
                <div>{l.text}</div>
                {l.warning && (
                  <div className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">{l.warning}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DayFeed({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return <div className="card p-4 text-sm text-slate-500">Nothing recorded for this day.</div>;
  return (
    <ol className="space-y-2">
      {items.map((it) => (
        <li key={it.key} className={`card flex gap-3 p-3 ${BORDER[it.tone]}`}>
          <div className="w-24 shrink-0 text-xs text-slate-600">
            <div className="font-semibold text-slate-900">{fmtTimeSec(it.ts)}</div>
            {it.nextDay && <div className="text-[10px] font-semibold text-slate-500">next day</div>}
          </div>
          <span className={`mt-0.5 h-6 min-w-9 shrink-0 rounded px-1.5 text-center text-[10px] font-bold leading-6 text-white ${BG[it.tone]}`}>{it.icon}</span>
          <div className="min-w-0 flex-1 break-words text-sm">
            <div className="font-medium">{it.title}</div>
            {it.line && <div className="text-slate-600">{it.line}</div>}
            {it.detail !== undefined && it.detail !== null && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-slate-500">Raw detail</summary>
                <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(it.detail, null, 2)}</pre>
              </details>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
