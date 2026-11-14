"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, CircleMarker, ImageOverlay, TileLayer, useMap } from "react-leaflet";
import { MapContainer } from "@/components/map/MapContainer";
import { closeupHalfM, OUR_HALF_M, TREK, TREK_SP_HALF_M, TREK_SP_SPAN_M, trekTileUrl, type TrekKey, type TrekLayer } from "@/lib/moonbase/closeup";
import { toXY } from "@/lib/moonbase/projection";
import type { ArtemisRegion } from "@/lib/moonbase/regions";

/**
 * Close-up of one Artemis III region on NASA Moon Trek's south polar tiles. The CRS is Trek's own grid in metres
 * (polar stereographic, 0° up), so Leaflet's {z}/{y}/{x} lands exactly on Trek's tiles and a map coordinate
 * [lat, lng] is simply [y m, x m]. Our layer images and the landing sites go on top in the same metres.
 */

const CRS = L.extend({}, L.CRS.Simple, {
  transformation: new L.Transformation(256 / TREK_SP_SPAN_M, (256 * TREK_SP_HALF_M) / TREK_SP_SPAN_M, -256 / TREK_SP_SPAN_M, (256 * TREK_SP_HALF_M) / TREK_SP_SPAN_M),
});

const square = (half: number) => L.latLngBounds([-half, -half], [half, half]);
const OUR_BOUNDS = square(OUR_HALF_M);

export interface CloseupState {
  base: Extract<TrekKey, "nac" | "wac" | "hillshade">;
  /** LOLA hillshade blended over the base imagery, 0..1 (ignored when the base is the hillshade). */
  shade: number;
  sunlight: boolean;
  psr: boolean;
  /** One of our layer images (public/data/moonbase), or null. */
  ours: { src: string; opacity: number } | null;
}

function Trek({ layer, opacity = 1, className, zIndex }: { layer: TrekLayer; opacity?: number; className?: string; zIndex: number }) {
  return (
    <TileLayer
      url={trekTileUrl(layer)}
      tileSize={256}
      maxNativeZoom={layer.maxNativeZoom}
      maxZoom={13}
      bounds={square(layer.halfM)}
      noWrap
      opacity={opacity}
      className={className}
      zIndex={zIndex}
    />
  );
}

/** Fit the region's box whenever the region changes. */
function FitRegion({ region }: { region: ArtemisRegion }) {
  const map = useMap();
  useEffect(() => {
    const half = closeupHalfM(region);
    const cx = region.x * 1000;
    const cy = region.y * 1000;
    const box = L.latLngBounds([cy - half, cx - half], [cy + half, cx + half]);
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(box, { animate: false });
      map.setMinZoom(Math.max(2, map.getZoom() - 2));
    };
    fit();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map, region]);
  return null;
}

function ScaleBar() {
  const map = useMap();
  useEffect(() => {
    const c = L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);
    return () => void c.remove();
  }, [map]);
  return null;
}

export default function CloseupMap({ region, state }: { region: ArtemisRegion; state: CloseupState }) {
  const sites = useMemo(() => region.sites.map(([lat, lon]) => toXY(lat, lon)), [region]);
  const maxZoom = state.base === "nac" ? 12 : 9;
  return (
    <MapContainer
      crs={CRS}
      center={[region.y * 1000, region.x * 1000]}
      zoom={7}
      maxZoom={maxZoom}
      zoomSnap={0.25}
      attributionControl={false}
      className="closeup-map size-full"
    >
      <FitRegion region={region} />
      <ScaleBar />
      <Trek key={state.base} layer={TREK[state.base]} zIndex={1} />
      {state.base !== "hillshade" && state.shade > 0 && <Trek layer={TREK.hillshade} opacity={state.shade} className="closeup-blend" zIndex={2} />}
      {state.ours && <ImageOverlay url={state.ours.src} bounds={OUR_BOUNDS} opacity={state.ours.opacity} className="closeup-ours" zIndex={3} />}
      {state.sunlight && <Trek layer={TREK.sunlight} opacity={0.75} zIndex={4} />}
      {state.psr && <Trek layer={TREK.psr} opacity={0.95} className="closeup-screen" zIndex={5} />}
      <Circle
        center={[region.y * 1000, region.x * 1000]}
        radius={region.radiusKm * 1000}
        pathOptions={{ color: "#5fe0d0", weight: 1.5, opacity: 0.85, fill: false, dashArray: "6 6" }}
        interactive={false}
      />
      {sites.map(([x, y], i) => (
        <CircleMarker
          key={i}
          center={[y * 1000, x * 1000]}
          radius={4}
          pathOptions={{ color: "#03050b", weight: 1.5, fillColor: "#ffd27a", fillOpacity: 1 }}
          interactive={false}
        />
      ))}
    </MapContainer>
  );
}
