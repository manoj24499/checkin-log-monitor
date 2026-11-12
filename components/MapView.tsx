"use client";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface ViewPoint {
  id: string;
  label: string; // pre-formatted text for popup
  lat: number;
  lng: number;
  color: string;
  mocked: boolean;
}
export interface ViewSegment {
  coords: [number, number][];
  dashed: boolean;
}

function Fit({ pts, segs, focusId }: { pts: ViewPoint[]; segs: ViewSegment[]; focusId?: string }) {
  const map = useMap();
  useEffect(() => {
    const focus = focusId ? pts.find((p) => p.id === focusId) : undefined;
    if (focus) {
      map.setView([focus.lat, focus.lng], 17);
      return;
    }
    const all: [number, number][] = [...pts.map((p) => [p.lat, p.lng] as [number, number]), ...segs.flatMap((s) => s.coords)];
    if (all.length) map.fitBounds(all as LatLngBoundsExpression, { padding: [30, 30], maxZoom: 17 });
  }, [map, pts, segs, focusId]);
  return null;
}

export default function MapView({ points, segments, focusId }: { points: ViewPoint[]; segments: ViewSegment[]; focusId?: string }) {
  const center: LatLngExpression = points[0] ? [points[0].lat, points[0].lng] : [20.5937, 78.9629];
  return (
    <MapContainer center={center} zoom={points.length ? 14 : 5} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Fit pts={points} segs={segments} focusId={focusId} />
      {segments.map((s, i) => (
        <Polyline
          key={i}
          positions={s.coords}
          pathOptions={{ color: s.dashed ? "#dc2626" : "#2563eb", weight: s.dashed ? 3 : 4, dashArray: s.dashed ? "8 8" : undefined }}
        />
      ))}
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={p.id === focusId ? 11 : 7}
          pathOptions={{ color: p.mocked ? "#dc2626" : "#fff", weight: p.mocked ? 3 : 2, fillColor: p.color, fillOpacity: 0.9 }}
        >
          <Popup>
            <div style={{ whiteSpace: "pre-line", fontSize: 13 }}>{p.label}</div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
