import Link from "next/link";
import { qs } from "@/lib/params";
import PhotoThumb, { PhotoExpired } from "./PhotoThumb";

const TONES: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
  slate: "bg-slate-100 text-slate-700",
  orange: "bg-orange-100 text-orange-800",
  blue: "bg-blue-100 text-blue-800",
};

export function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone] ?? TONES.slate}`}>{children}</span>;
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const o = outcome.toUpperCase();
  return <Badge tone={o === "SUCCESS" ? "green" : o === "REJECTED" ? "amber" : "red"}>{o.toLowerCase()}</Badge>;
}

export function FaceBadge({ status, sim }: { status: string | null; sim: number | null }) {
  if (!status || status === "NOT_CHECKED") return <span className="text-slate-400">-</span>;
  const tone = status === "MATCHED" ? "green" : status === "MISMATCH" ? "red" : "amber";
  return (
    <span className="whitespace-nowrap">
      <Badge tone={tone}>{status.toLowerCase()}</Badge>
      {sim != null && <span className="ml-1 text-xs text-slate-600">{(sim * 100).toFixed(0)}%</span>}
    </span>
  );
}

/** Failed-verification photo from a CheckInAttempt row, or an "expired" placeholder. */
export function FailedFacePhoto({ attemptId, hasPhoto, sim, caption }: { attemptId: string; hasPhoto: boolean; sim: number | null; caption?: string }) {
  if (!hasPhoto) return <PhotoExpired />;
  return (
    <PhotoThumb
      src={`/api/photo/attempt/${encodeURIComponent(attemptId)}`}
      badge="Failed"
      caption={`Failed verification${sim != null ? ` - similarity ${(sim * 100).toFixed(0)}%` : ""}${caption ? ` - ${caption}` : ""}`}
    />
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

export function Notice({ children, tone = "amber" }: { children: React.ReactNode; tone?: "amber" | "red" }) {
  return (
    <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${tone === "red" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      {children}
    </div>
  );
}

export const ATTEMPT_NOTICE =
  "Attempt log not enabled yet - apply migration 20261112000000_checkin_attempt_log on the server. Showing accepted records only.";

export function Stat({ label, value, href, tone }: { label: string; value: number | string; href?: string; tone?: "red" | "amber" }) {
  const body = (
    <div className="card h-full p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="card max-w-full overflow-x-auto">{children}</div>;
}

export function Pager({ path, base, page, hasNext }: { path: string; base: Record<string, string | number | undefined | false>; page: number; hasNext: boolean }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-sm">
      {page > 1 && <Link className="btn-ghost" href={`${path}${qs({ ...base, page: page - 1 })}`}>Previous</Link>}
      <span className="text-slate-600">Page {page}</span>
      {hasNext && <Link className="btn-ghost" href={`${path}${qs({ ...base, page: page + 1 })}`}>Next</Link>}
    </div>
  );
}

export function EmployeeLink({ code, name }: { code: string | null; name: string | null }) {
  if (!code) return <span className="text-slate-400">unknown</span>;
  return (
    <Link href={`/employees/${encodeURIComponent(code)}`} className="text-accent-dark hover:underline">
      {name ? <span className="font-medium">{name}</span> : null} <span className="text-slate-500">{code}</span>
    </Link>
  );
}
