"use client";
import { useState } from "react";

export function PhotoExpired() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-[10px] leading-tight text-slate-500">
      photo expired
    </div>
  );
}

/** Thumbnail that opens a larger view on click. Shows an "expired" placeholder if the image fails to load. */
export default function PhotoThumb({ src, caption, badge }: { src: string; caption?: string; badge?: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return <PhotoExpired />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="relative block" aria-label="Open photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading="lazy"
          width={56}
          height={56}
          onError={() => setFailed(true)}
          className="h-14 w-14 rounded-lg border border-slate-200 object-cover"
        />
        {badge && <span className="absolute -bottom-1 left-0 rounded bg-red-600 px-1 text-[9px] font-semibold text-white">{badge}</span>}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[3000] flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="max-h-[80vh] max-w-full rounded-lg bg-white object-contain" />
          {caption && <div className="rounded bg-white px-3 py-1 text-sm">{caption}</div>}
          <button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </>
  );
}
