"use client";
import dynamic from "next/dynamic";
import type { ViewPoint, ViewSegment } from "./MapView";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading map...</div>,
});

export default function MapLoader(props: { points: ViewPoint[]; segments: ViewSegment[]; focusId?: string }) {
  return <MapView {...props} />;
}
