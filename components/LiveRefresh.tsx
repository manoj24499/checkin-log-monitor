"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function hhmm(d: Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
}

export default function LiveRefresh() {
  const router = useRouter();
  const [live, setLive] = useState(true);
  const [at, setAt] = useState<string>("");

  useEffect(() => setAt(hhmm(new Date())), []);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      router.refresh();
      setAt(hhmm(new Date()));
    }, 60000);
    return () => clearInterval(t);
  }, [live, router]);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-green-500 animate-pulse" : "bg-slate-400"}`} />
      <span className="text-slate-600">{live ? "Live" : "Paused"} · updated {at || "..."}</span>
      <button type="button" className="btn-ghost !py-1" onClick={() => setLive((v) => !v)}>
        {live ? "Pause" : "Resume"}
      </button>
    </div>
  );
}
