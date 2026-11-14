"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { useEffect } from "react";
import { ImageOverlay, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { MapContainer } from "@/components/map/MapContainer";

const WORLD = L.latLngBounds([-90, -180], [90, 180]);

/** Same GIBS grid as components/map/WorldMap (512 px tiles, 0.5625° per pixel at level 0). */
const GIBS_CRS: L.CRS = L.extend({}, L.CRS.EPSG4326, {
  transformation: new L.Transformation(1, 180, -1, 90),
  scale: (zoom: number) => Math.pow(2, zoom) / 0.5625,
  zoom: (scale: number) => Math.log(scale * 0.5625) / Math.LN2,
});

const BLUE_MARBLE =
  "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/default/500m/{z}/{y}/{x}.jpeg";

export interface MapPin {
  id: string;
  lat: number;
  lon: number;
  rank?: number;
  label: string;
  kind: "pick" | "probe" | "ref";
}

function pinIcon(p: MapPin, selected: boolean) {
  const safe = p.label.replace(/[&<>"]/g, "");
  const inner = p.kind === "pick" ? String(p.rank) : "";
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<span class="finder-pin finder-pin-${p.kind}"${selected ? " data-selected" : ""} aria-hidden="true"><span class="finder-pin-dot">${inner}</span><span class="finder-pin-label">${safe}</span></span>`,
  });
}

/** The world fills the frame: minimum zoom covers the container (fractional), panning held to the world edge. */
function FitWorld() {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      const cover = map.getBoundsZoom(WORLD, true);
      map.setMinZoom(cover);
      if (map.getZoom() < cover) map.setView(map.getCenter(), cover, { animate: false });
      map.panInsideBounds(WORLD, { animate: false });
    };
    const id = requestAnimationFrame(() => {
      fit();
      map.setView([15, 10], map.getMinZoom(), { animate: false });
      map.panInsideBounds(WORLD, { animate: false });
    });
    map.on("resize", fit);
    return () => {
      cancelAnimationFrame(id);
      map.off("resize", fit);
    };
  }, [map]);
  return null;
}

function Controls() {
  const map = useMap();
  const btn =
    "flex size-9 items-center justify-center rounded-lg text-foreground/85 transition-colors duration-150 hover:bg-white/10 hover:text-foreground active:scale-[0.96]";
  return (
    <div className="absolute end-3 top-3 z-[500] flex flex-col rounded-xl glass p-1">
      <button type="button" className={btn} aria-label="Zoom in" onClick={() => map.zoomIn()}>
        <Plus className="size-4" aria-hidden />
      </button>
      <button type="button" className={btn} aria-label="Zoom out" onClick={() => map.zoomOut()}>
        <Minus className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        className={btn}
        aria-label="Show the whole Earth"
        onClick={() => map.setView([15, 10], map.getMinZoom())}
      >
        <Maximize2 className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function ClickProbe({ onProbe }: { onProbe: (lat: number, lon: number) => void }) {
  useMapEvents({
    click: (e) => {
      const { lat, lng } = e.latlng;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
      onProbe(lat, lng);
    },
  });
  return null;
}

export interface FlyRequest {
  lat: number;
  lon: number;
  /** Bumped on every request so flying to the same place twice still works. */
  n: number;
}

function FlyTo({ fly }: { fly: FlyRequest | null }) {
  const map = useMap();
  const n = fly?.n;
  useEffect(() => {
    if (!fly) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const z = Math.max(map.getZoom(), map.getMinZoom() + 1.5);
    if (reduce) map.setView([fly.lat, fly.lon], z);
    else map.flyTo([fly.lat, fly.lon], z, { duration: 0.7 });
    // Only a new request (n) should move the map, not a re-render with the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, n]);
  return null;
}

export default function FinderMap({
  heatUrl,
  pins,
  selectedId,
  fly,
  onPick,
  onProbe,
}: {
  heatUrl: string | null;
  pins: MapPin[];
  selectedId: string | null;
  fly: FlyRequest | null;
  onPick: (id: string) => void;
  onProbe: (lat: number, lon: number) => void;
}) {
  return (
    <MapContainer
      crs={GIBS_CRS}
      center={[10, 10]}
      zoom={1}
      minZoom={0}
      maxZoom={8}
      zoomSnap={0.25}
      zoomDelta={0.5}
      maxBounds={WORLD}
      maxBoundsViscosity={1}
      zoomControl={false}
      scrollWheelZoom={false}
      worldCopyJump={false}
      attributionControl
      className="finder-map size-full bg-background"
    >
      <TileLayer
        url={BLUE_MARBLE}
        attribution="NASA EOSDIS GIBS · Blue Marble"
        tileSize={512}
        maxNativeZoom={7}
        noWrap
        bounds={WORLD}
        crossOrigin
      />
      {heatUrl && <ImageOverlay url={heatUrl} bounds={WORLD} opacity={0.92} className="finder-heat" />}
      {pins.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lon]}
          icon={pinIcon(p, p.id === selectedId)}
          title={p.label}
          keyboard
          zIndexOffset={p.id === selectedId ? 1000 : p.kind === "probe" ? 900 : 0}
          eventHandlers={{ click: () => onPick(p.id) }}
        />
      ))}
      <ClickProbe onProbe={onProbe} />
      <FlyTo fly={fly} />
      <FitWorld />
      <Controls />
    </MapContainer>
  );
}
