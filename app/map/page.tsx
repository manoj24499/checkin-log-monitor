import Link from "next/link";
import Shell from "@/components/Shell";
import MapLoader from "@/components/MapLoader";
import type { ViewPoint, ViewSegment } from "@/components/MapView";
import { ATTEMPT_NOTICE, Badge, Notice, PageHeader } from "@/components/ui";
import { dateParam, qs, str, type SP } from "@/lib/params";
import { MAP_CAP, getMapPoints, getTrail } from "@/lib/queries/map";
import { fmtDateTime, fmtTime, todayIST } from "@/lib/time";

export const dynamic = "force-dynamic";

function colorFor(p: { action: string; outcome: string }): string {
  if (p.outcome !== "SUCCESS") return "#f59e0b";
  return p.action === "CHECK_IN" ? "#16a34a" : p.action === "CHECK_OUT" ? "#2563eb" : "#64748b";
}

export default async function MapPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const day = dateParam(sp, "date", todayIST());
  const emp = str(sp, "emp", 40);
  const focusId = /^[A-Za-z0-9_-]{1,64}$/.test(str(sp, "pt", 64)) ? str(sp, "pt", 64) : undefined;

  const { points, capped, attemptsEnabled } = await getMapPoints(day);
  const trailData = emp ? await getTrail(emp, day) : null;

  const shown = emp ? points.filter((p) => p.code === emp) : points;
  const viewPoints: ViewPoint[] = shown.map((p) => ({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    color: colorFor(p),
    mocked: p.mocked,
    label: [
      `${p.name} (${p.code})`,
      `${p.action === "CHECK_IN" ? "Check-in" : p.action === "CHECK_OUT" ? "Check-out" : "Attempt"} - ${p.outcome.toLowerCase()}${p.reasonCode ? ` (${p.reasonCode})` : ""}`,
      fmtDateTime(p.ts),
      p.mocked ? "MOCKED LOCATION" : "",
      p.approx ? "approximate (nearest location ping)" : "",
    ].filter(Boolean).join("\n"),
  }));

  const segments: ViewSegment[] = [];
  if (trailData && trailData.trail.length > 1) {
    const t = trailData.trail;
    let start = 0;
    const gapAt = new Set(trailData.gaps.map((g) => g.fromIdx));
    for (let i = 0; i < t.length - 1; i++) {
      if (gapAt.has(i)) {
        if (i > start) segments.push({ coords: t.slice(start, i + 1).map((x) => [x.lat, x.lng]), dashed: false });
        segments.push({ coords: [[t[i].lat, t[i].lng], [t[i + 1].lat, t[i + 1].lng]], dashed: true });
        start = i + 1;
      }
    }
    if (t.length - 1 > start) segments.push({ coords: t.slice(start).map((x) => [x.lat, x.lng]), dashed: false });
  }

  // side list: people with points on this day
  const people = new Map<string, { name: string; n: number }>();
  for (const p of points) {
    const e = people.get(p.code) ?? { name: p.name, n: 0 };
    e.n++;
    people.set(p.code, e);
  }

  return (
    <Shell>
      <PageHeader title="Locations" />
      {!attemptsEnabled && <Notice>{ATTEMPT_NOTICE} Check-in points are approximated from the nearest location ping.</Notice>}
      {capped && <Notice>Showing the newest {MAP_CAP} points only (capped).</Notice>}
      {trailData?.capped && <Notice>Trail capped at the first {MAP_CAP} pings of the day.</Notice>}
      <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-600">Date (IST)<input className="input block" type="date" name="date" defaultValue={day} /></label>
        {emp && <input type="hidden" name="emp" value={emp} />}
        <button className="btn" type="submit">Show</button>
        {emp && <Link className="btn-ghost" href={`/map${qs({ date: day })}`}>All employees</Link>}
      </form>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-600">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-green-600" />Check-in</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />Check-out</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />Rejected / error</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-red-600" />Mocked</span>
        <span>Trail: blue line; red dashed = gap over 15 min</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <div className="card h-[60vh] min-h-[320px] overflow-hidden">
          <MapLoader points={viewPoints} segments={segments} focusId={focusId} />
        </div>
        <div className="space-y-3">
          <div className="card max-h-[40vh] overflow-y-auto p-2 lg:max-h-[45vh]">
            <div className="px-2 py-1 text-xs font-semibold text-slate-500">Employees ({people.size})</div>
            {people.size === 0 && <div className="p-2 text-sm text-slate-500">No located points on this day.</div>}
            {[...people.entries()].map(([code, v]) => (
              <Link key={code} href={`/map${qs({ date: day, emp: code })}`}
                className={`flex justify-between rounded px-2 py-1.5 text-sm hover:bg-orange-50 ${code === emp ? "bg-orange-100 font-semibold" : ""}`}>
                <span className="truncate">{v.name} <span className="text-slate-500">{code}</span></span>
                <span className="text-slate-500">{v.n}</span>
              </Link>
            ))}
          </div>
          {trailData && (
            <div className="card p-3 text-sm">
              <div className="font-semibold">Trail for {emp}</div>
              <div className="text-slate-600">{trailData.trail.length} pings{trailData.trail.length ? `, ${fmtTime(trailData.trail[0].ts)} - ${fmtTime(trailData.trail[trailData.trail.length - 1].ts)}` : ""}</div>
              <div className="mt-2 font-semibold">Tracking gaps ({trailData.gaps.length})</div>
              {trailData.gaps.length === 0 ? (
                <div className="text-slate-500">No gaps over 15 minutes.</div>
              ) : (
                <ul className="mt-1 space-y-1">
                  {trailData.gaps.map((g, i) => (
                    <li key={i}><Badge tone="red">{g.minutes} min</Badge> <span className="text-slate-600">{fmtTime(g.fromTs)} to {fmtTime(g.toTs)}</span></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
