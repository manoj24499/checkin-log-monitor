import { type NextRequest } from "next/server";
import { parseLogFilters, queryLog, type LogRow } from "@/lib/queries/log";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const MAX_ROWS = 20000;
const CHUNK = 500;

/** Prevent spreadsheet formula injection: prefix risky leading characters with a single quote. */
function cell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const HEADER = [
  "time_ist", "employee_code", "employee_name", "action", "outcome", "reason_code", "reason", "mode", "source",
  "offline", "face_status", "face_similarity_pct", "late_minutes", "latitude", "longitude", "mocked", "ip", "kind",
];

function line(r: LogRow): string {
  return [
    fmtDateTime(r.ts), r.code, r.name, r.action, r.outcome, r.reasonCode, r.reason, r.mode, r.source,
    r.offline ? "yes" : "no", r.face, r.sim != null ? (r.sim * 100).toFixed(1) : "", r.late, r.lat, r.lng,
    r.mocked == null ? "" : r.mocked ? "yes" : "no", r.ip, r.kind,
  ].map(cell).join(",");
}

export async function GET(req: NextRequest) {
  const sp: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { if (!(k in sp)) sp[k] = v; });
  const f = parseLogFilters(sp);

  const { rows } = await queryLog(f, MAX_ROWS, 0);
  let i = 0;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode("﻿" + HEADER.join(",") + "\r\n"));
    },
    pull(c) {
      if (i >= rows.length) return c.close();
      const out = rows.slice(i, i + CHUNK).map(line).join("\r\n") + "\r\n";
      i += CHUNK;
      c.enqueue(enc.encode(out));
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="checkin-log-${f.from}_${f.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
