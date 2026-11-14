"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Minus, Plus, Scan } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import { MapContainer } from "@/components/map/MapContainer";
import { DATA_BASE } from "@/lib/moonbase/grids";
import { HALF_W_KM, toLatLon, toXY } from "@/lib/moonbase/projection";
import { ARTEMIS_REGIONS, POLAR_FEATURES } from "@/lib/moonbase/regions";
import { useMoonbase } from "@/lib/moonbase/store";
import type { Manifest } from "@/lib/moonbase/types";

/**
 * The south polar base map. Leaflet runs in CRS.Simple with kilometres as map units, so a map coordinate
 * [lat, lng] is the polar stereographic [y km, x km] and every display image covers ±457.44 km exactly.
 */

const BOUNDS = L.latLngBounds([-HALF_W_KM, -HALF_W_KM], [HALF_W_KM, HALF_W_KM]);
const ll = (x: number, y: number) => L.latLng(y, x);

/** Label placement for regions whose centres sit close together (Mons Mouton cluster). */
const LABEL_DIR: Record<string, L.Direction> = {
  "mons-mouton": "left",
  "nobile-rim-1": "right",
  "mons-mouton-plateau": "top",
  "south-pole": "right",
  shackleton: "bottom",
};

export interface TopSpot {
  x: number;
  y: number;
  score: number;
}

/** Fit the whole grid on load and on resize; never zoom out past it. */
function FitGrid() {
  const map = useMap();
  useEffect(() => {
    const fit = (first: boolean) => {
      map.invalidateSize();
      const z = map.getBoundsZoom(BOUNDS, false);
      map.setMinZoom(z - 0.25);
      if (first || map.getZoom() < z - 0.25) map.fitBounds(BOUNDS, { animate: false });
    };
    const id = requestAnimationFrame(() => fit(true));
    const onResize = () => fit(false);
    map.on("resize", onResize);
    return () => {
      cancelAnimationFrame(id);
      map.off("resize", onResize);
    };
  }, [map]);
  return null;
}

/** Display images and the heat canvas get their own panes under the vector overlays (graticule, regions). */
function Panes() {
  const map = useMap();
  useEffect(() => {
    for (const [name, z] of [["mbBase", 300], ["mbHeat", 350]] as const) {
      if (!map.getPane(name)) map.createPane(name).style.zIndex = String(z);
    }
  }, [map]);
  return null;
}

/** The active display image, cross-faded on change (opacity only). */
function LayerImage({ src, mono }: { src: string; mono: boolean }) {
  const map = useMap();
  const stack = useRef<L.ImageOverlay[]>([]);
  useEffect(() => {
    if (!map.getPane("mbBase")) return;
    const next = L.imageOverlay(src, BOUNDS, { pane: "mbBase", opacity: 0, className: `mb-layer${mono ? " mb-mono" : ""}`, interactive: false });
    next.addTo(map);
    stack.current.push(next);
    let timer = 0;
    const show = () => {
      next.setOpacity(1);
      timer = window.setTimeout(() => {
        for (const o of stack.current) if (o !== next) o.remove();
        stack.current = [next];
      }, 320);
    };
    const el = next.getElement();
    if (el?.complete && el.naturalWidth > 0) show();
    else next.once("load", show);
    return () => {
      window.clearTimeout(timer);
      next.off("load", show);
    };
  }, [map, src, mono]);
  useEffect(
    () => () => {
      for (const o of stack.current) o.remove();
      stack.current = [];
    },
    [map],
  );
  return null;
}

/** Suitability heat layer: the canvas is placed by Leaflet like an image (SVGOverlay accepts any element). */
function CanvasLayer({ canvas }: { canvas: HTMLCanvasElement | null }) {
  const map = useMap();
  useEffect(() => {
    if (!canvas || !map.getPane("mbHeat")) return;
    const layer = L.svgOverlay(canvas as unknown as SVGElement, BOUNDS, { pane: "mbHeat", className: "mb-canvas", interactive: false, opacity: 0.92 });
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, canvas]);
  return null;
}

/** Latitude rings and longitude spokes, drawn as thin lines with small labels. */
function Graticule() {
  const map = useMap();
  useEffect(() => {
    const group = L.layerGroup();
    const line = { color: "#ffffff", weight: 0.8, opacity: 0.22, interactive: false };
    for (const lat of [-76, -78, -80, -82, -84, -86, -88]) {
      const r = Math.hypot(...toXY(lat, 0));
      L.circle(ll(0, 0), { radius: r, fill: false, ...line, dashArray: lat % 4 === 0 ? undefined : "2 5" }).addTo(group);
      if (lat >= -88 && lat % 2 === 0) {
        const [x, y] = toXY(lat, 135);
        L.marker(ll(x, y), {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: "mb-grat", html: `${Math.abs(lat)}°S`, iconSize: [36, 14], iconAnchor: [18, 7] }),
        }).addTo(group);
      }
    }
    for (let lon = -150; lon <= 180; lon += 30) {
      const pts = [toXY(-75.2, lon), toXY(-89.6, lon)].map(([x, y]) => ll(x, y));
      L.polyline(pts, line).addTo(group);
      const [x, y] = toXY(-75.9, lon);
      const name = lon === 0 ? "0°" : lon === 180 ? "180°" : `${Math.abs(lon)}°${lon < 0 ? "W" : "E"}`;
      L.marker(ll(x, y), {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: "mb-grat mb-grat-lon", html: name, iconSize: [40, 14], iconAnchor: [20, 7] }),
      }).addTo(group);
    }
    if (!map.getPane("overlayPane")) return;
    group.addTo(map);
    return () => {
      group.remove();
    };
  }, [map]);
  return null;
}

/** Artemis III regions (approximate extents), their published landing sites, Shackleton and the pole. */
function Regions() {
  const map = useMap();
  const focus = useMoonbase((s) => s.focusRegion);
  const layers = useRef<Map<string, L.Circle>>(new Map());

  useEffect(() => {
    if (!map.getPane("overlayPane")) return;
    const group = L.layerGroup();
    const store = useMoonbase.getState();
    for (const r of ARTEMIS_REGIONS) {
      const circle = L.circle(ll(r.x, r.y), {
        radius: r.radiusKm,
        color: "#7ef9e4",
        weight: 1.4,
        opacity: 0.9,
        dashArray: "5 4",
        fillColor: "#7ef9e4",
        fillOpacity: 0.06,
        className: "mb-region",
      });
      circle.bindTooltip(`<b>${r.short}</b><span class="mb-label-full"> ${r.name}</span>`, {
        permanent: true,
        direction: LABEL_DIR[r.id] ?? "top",
        className: "mb-label",
        offset: [0, 0],
        interactive: true,
      });
      circle.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        store.setFocusRegion(r.id);
        const [lat, lon] = toLatLon(r.x, r.y);
        store.setPinned({ x: r.x, y: r.y, lat, lon });
      });
      circle.addTo(group);
      layers.current.set(r.id, circle);
      for (const [la, lo] of r.sites) {
        const [x, y] = toXY(la, lo);
        L.circleMarker(ll(x, y), { radius: 1.8, color: "#0b1020", weight: 0.8, fillColor: "#7ef9e4", fillOpacity: 1, interactive: false, className: "mb-site" }).addTo(group);
      }
    }
    for (const f of POLAR_FEATURES) {
      if (f.radiusKm > 0) {
        L.circle(ll(f.x, f.y), { radius: f.radiusKm, color: "#ffd27a", weight: 1.2, opacity: 0.9, fill: false, interactive: false }).addTo(group);
      }
      const m = L.marker(ll(f.x, f.y), {
        keyboard: false,
        interactive: false,
        icon: L.divIcon({ className: "", html: `<span class="mb-feature${f.radiusKm ? "" : " mb-pole"}"></span>`, iconSize: [12, 12], iconAnchor: [6, 6] }),
      });
      m.bindTooltip(f.name, { permanent: true, direction: LABEL_DIR[f.id] ?? "top", className: "mb-label mb-label-feature", offset: [0, 0] });
      m.addTo(group);
    }
    group.addTo(map);
    const circles = layers.current;
    return () => {
      group.remove();
      circles.clear();
    };
  }, [map]);

  useEffect(() => {
    for (const [id, c] of layers.current) {
      const on = id === focus;
      c.setStyle({ weight: on ? 2.4 : 1.4, fillOpacity: on ? 0.14 : 0.06, dashArray: on ? undefined : "5 4" });
      if (on) c.bringToFront();
    }
  }, [focus]);
  return null;
}

/** Numbered markers on the best cells for the current weights. */
function Spots({ spots }: { spots: TopSpot[] }) {
  const map = useMap();
  useEffect(() => {
    const group = L.layerGroup();
    const store = useMoonbase.getState();
    spots.forEach((s, i) => {
      const m = L.marker(ll(s.x, s.y), {
        keyboard: false,
        icon: L.divIcon({ className: "", html: `<span class="mb-spot">${i + 1}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        title: `Best spot ${i + 1}: ${(s.score * 100).toFixed(0)} / 100`,
      });
      m.on("click", () => {
        const [lat, lon] = toLatLon(s.x, s.y);
        store.setPinned({ x: s.x, y: s.y, lat, lon });
      });
      m.addTo(group);
    });
    group.addTo(map);
    return () => {
      group.remove();
    };
  }, [map, spots]);
  return null;
}

function Pin() {
  const map = useMap();
  const pinned = useMoonbase((s) => s.pinned);
  useEffect(() => {
    if (!pinned) return;
    const m = L.marker(ll(pinned.x, pinned.y), {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: "", html: '<span class="mb-pin"></span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      zIndexOffset: 1000,
    }).addTo(map);
    return () => {
      m.remove();
    };
  }, [map, pinned]);
  return null;
}

/** Hover → readout (one store update per frame); click → pin the point. */
function Pointer() {
  const raf = useRef(0);
  const last = useRef<L.LatLng | null>(null);
  const map = useMapEvents({
    mousemove: (e) => {
      last.current = e.latlng;
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        const p = last.current;
        if (!p || !BOUNDS.contains(p)) return useMoonbase.getState().setHover(null);
        const [lat, lon] = toLatLon(p.lng, p.lat);
        useMoonbase.getState().setHover({ x: p.lng, y: p.lat, lat, lon });
      });
    },
    mouseout: () => {
      last.current = null;
      useMoonbase.getState().setHover(null);
    },
    click: (e) => {
      if (!BOUNDS.contains(e.latlng)) return;
      const [lat, lon] = toLatLon(e.latlng.lng, e.latlng.lat);
      const s = useMoonbase.getState();
      s.setPinned({ x: e.latlng.lng, y: e.latlng.lat, lat, lon });
      s.setFocusRegion(null);
    },
    zoomend: () => {
      map.getContainer().dataset.zoomed = map.getZoom() >= map.getMinZoom() + 1.4 ? "true" : "false";
    },
  });
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return null;
}

function Fly() {
  const map = useMap();
  const fly = useMoonbase((s) => s.flyTo);
  useEffect(() => {
    if (!fly) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getMinZoom() + fly.zoom));
    if (reduce) map.setView(ll(fly.x, fly.y), z, { animate: false });
    else map.flyTo(ll(fly.x, fly.y), z, { duration: 0.9 });
  }, [map, fly]);
  return null;
}

function Controls() {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);
  const btn =
    "flex size-9 items-center justify-center text-foreground/85 transition-colors duration-150 hover:bg-white/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary";
  return (
    <div ref={ref} className="glass absolute right-3 bottom-3 z-[500] flex flex-col overflow-hidden rounded-xl">
      <button type="button" className={btn} aria-label="Zoom in" onClick={() => map.zoomIn(0.75)}>
        <Plus className="size-4" aria-hidden />
      </button>
      <button type="button" className={btn} aria-label="Zoom out" onClick={() => map.zoomOut(0.75)}>
        <Minus className="size-4" aria-hidden />
      </button>
      <button type="button" className={btn} aria-label="Show the whole map" onClick={() => map.flyToBounds(BOUNDS, { duration: 0.6 })}>
        <Scan className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export default function PolarMap({
  manifest,
  activeLayer,
  canvas,
  spots,
}: {
  manifest: Manifest;
  activeLayer: string;
  canvas: HTMLCanvasElement | null;
  spots: TopSpot[];
}) {
  const suit = activeLayer === "suitability";
  const layer = manifest.layers.find((l) => l.id === (suit ? "elevation" : activeLayer) && l.image);
  const src = layer?.image ? `${DATA_BASE}/${layer.image}?v=${encodeURIComponent(manifest.generated)}` : null;

  return (
    <MapContainer
      crs={L.CRS.Simple}
      center={[0, 0]}
      zoom={0}
      minZoom={-2}
      maxZoom={4.5}
      zoomSnap={0.25}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={90}
      maxBounds={BOUNDS.pad(0.08)}
      maxBoundsViscosity={0.9}
      zoomControl={false}
      attributionControl={false}
      className="mb-map size-full"
    >
      <Panes />
      <FitGrid />
      {src && <LayerImage src={src} mono={suit} />}
      {suit && <CanvasLayer canvas={canvas} />}
      <Graticule />
      <Regions />
      {suit && <Spots spots={spots} />}
      <Pin />
      <Pointer />
      <Fly />
      <Controls />
    </MapContainer>
  );
}
