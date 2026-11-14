"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { CircleMarker, ImageOverlay, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { MapContainer } from "./MapContainer";
import { layerOf } from "@/lib/data/globe";
import { sitesFor } from "@/lib/data/sites";
import { baseLayersFor, layersFor, type TileMapLayer } from "@/lib/layers";
import { useExplorer } from "@/lib/store";
import type { World } from "@/lib/worlds";
import { LayerPanel } from "./LayerPanel";
import { canProbe, ensureGrid, ensureLegend, sampleGibs, sampleGrid, useMapLayers } from "./science";

const WORLD_BOUNDS = L.latLngBounds([-90, -180], [90, 180]);

/**
 * NASA GIBS (Earth) does not use Leaflet's standard EPSG:4326 grid: its level-0 pixel is 0.5625° (a 512 px tile
 * spans 288°), halving at each level, with the grid anchored at 180°W, 90°N. This CRS matches it exactly.
 * NASA Trek (Moon, Mars) uses the standard grid (0.703125° per pixel at level 0), so L.CRS.EPSG4326 fits.
 */
const GIBS_CRS: L.CRS = L.extend({}, L.CRS.EPSG4326, {
  transformation: new L.Transformation(1, 180, -1, 90),
  scale: (zoom: number) => Math.pow(2, zoom) / 0.5625,
  zoom: (scale: number) => Math.log(scale * 0.5625) / Math.LN2,
});

function tileProps(layer: TileMapLayer) {
  return {
    url: layer.url,
    attribution: layer.attribution,
    tileSize: layer.tileSize,
    maxNativeZoom: layer.maxNativeZoom,
    noWrap: true,
    bounds: WORLD_BOUNDS,
    crossOrigin: true as const,
  };
}

/** The active science overlay for this world (one at a time), with its legend once fetched. */
function useActiveScience(world: World) {
  const activeLayerId = useExplorer((s) => s.activeLayerId);
  const layer = useMemo(() => layersFor(world).find((l) => l.id === activeLayerId), [world, activeLayerId]);
  const legend = useMapLayers((s) => (layer ? s.legends[layer.id] : undefined));
  useEffect(() => {
    if (layer?.group === "science") ensureLegend(layer.id);
  }, [layer]);
  useEffect(() => {
    if (layer?.type === "image" && legend) ensureGrid(legend);
  }, [layer, legend]);
  return { layer, legend };
}

/** Pointer position for the HUD, plus the science value under the pointer (hover) or at a click/tap (pinned). */
function PointerTracker({ world }: { world: World }) {
  const setHover = useExplorer((s) => s.setHover);
  const { layer, legend } = useActiveScience(world);
  const grid = useMapLayers((s) => (layer ? s.grids[layer.id] : undefined));
  const setHoverProbe = useMapLayers((s) => s.setHoverProbe);
  const setPinProbe = useMapLayers((s) => s.setPinProbe);
  const probing = canProbe(layer, legend);

  // A new layer or world clears old readings.
  useEffect(() => {
    setHoverProbe(null);
    setPinProbe(null);
  }, [layer, setHoverProbe, setPinProbe]);

  const map = useMapEvents({
    mousemove: (e) => {
      const { lat, lng } = e.latlng;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setHover(null);
        setHoverProbe(null);
        return;
      }
      setHover({ lat, lon: lng });
      // Precomputed grids are cheap to sample on every move; GIBS tiles are read on click only.
      if (probing && layer?.type === "image" && legend && grid) setHoverProbe(sampleGrid(legend, grid, lat, lng));
    },
    mouseout: () => {
      setHover(null);
      setHoverProbe(null);
    },
    click: (e) => {
      const { lat, lng: lon } = e.latlng;
      // Earth: any click on the map opens the point card (satellite view and NASA granules for that spot).
      if (world === "earth" && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) useExplorer.getState().setDataPoint({ lat, lon });
      if (!probing || !layer || !legend || lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
      if (layer.type === "image") {
        if (grid) setPinProbe(sampleGrid(legend, grid, lat, lon));
        else setPinProbe({ lat, lon, status: "loading" });
        return;
      }
      setPinProbe({ lat, lon, status: "loading" });
      void sampleGibs(layer, legend, lat, lon, map.getZoom()).then((p) => {
        // Ignore a slow answer if the user has clicked somewhere else since.
        const cur = useMapLayers.getState().pinProbe;
        if (cur && cur.lat === lat && cur.lon === lon) setPinProbe(p);
      });
    },
  });

  // A click made before the grid arrived gets its value once it does.
  const pin = useMapLayers((s) => s.pinProbe);
  useEffect(() => {
    if (pin?.status === "loading" && layer?.type === "image" && legend && grid) setPinProbe(sampleGrid(legend, grid, pin.lat, pin.lon));
  }, [pin, layer, legend, grid, setPinProbe]);

  const point = useExplorer((s) => s.dataPoint);
  return (
    <>
      {pin && (
        <CircleMarker
          center={[pin.lat, pin.lon]}
          radius={6}
          interactive={false}
          pathOptions={{ color: "oklch(0.88 0.14 182)", weight: 2, fillColor: "#fff", fillOpacity: 0.9 }}
        />
      )}
      {point && (!pin || pin.lat !== point.lat || pin.lon !== point.lon) && (
        <CircleMarker center={[point.lat, point.lon]} radius={7} interactive={false} pathOptions={{ color: "#fff", weight: 2, fillOpacity: 0 }} />
      )}
    </>
  );
}

/** The science overlay itself: GIBS/Trek tiles or a precomputed image, at the chosen opacity. */
function ScienceOverlay({ world }: { world: World }) {
  const { layer, legend } = useActiveScience(world);
  const opacity = useMapLayers((s) => s.opacity);
  if (!layer) return null;
  if (layer.type === "tile") return <TileLayer key={layer.id} {...tileProps(layer)} opacity={opacity} zIndex={2} />;
  if (!legend?.image || !legend.bounds) return null;
  return <ImageOverlay key={layer.id} url={legend.image} bounds={legend.bounds} opacity={opacity} zIndex={2} attribution={layer.attribution} className="science-overlay" />;
}

/**
 * The world always covers the whole viewport: the minimum zoom is the one where the map fills the screen
 * (fractional zoom allowed), recomputed whenever the container resizes, and panning is held to the world edge.
 */
function FitWorld() {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      const cover = map.getBoundsZoom(WORLD_BOUNDS, true);
      map.setMinZoom(cover);
      if (map.getZoom() < cover) map.setView(map.getCenter(), cover, { animate: false });
      map.panInsideBounds(WORLD_BOUNDS, { animate: false });
    };
    const id = requestAnimationFrame(fit);
    map.on("resize", fit);
    return () => {
      cancelAnimationFrame(id);
      map.off("resize", fit);
    };
  }, [map]);
  return null;
}

/** Same glowing pin as the globe, as a Leaflet div icon. */
function pinIcon(name: string, selected: boolean) {
  const safe = name.replace(/[&<>"]/g, "");
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<span class="site-pin"${selected ? " data-selected" : ""}><span class="site-pin-dot"></span><span class="site-pin-label">${safe}</span></span>`,
  });
}

function SitePins({ world }: { world: World }) {
  const hiddenLayers = useExplorer((s) => s.hiddenLayers);
  const sites = useMemo(() => sitesFor(world).filter((s) => world !== "earth" || !hiddenLayers.includes(layerOf(s))), [world, hiddenLayers]);
  const selectedId = useExplorer((s) => s.selectedSiteId);
  const selectSite = useExplorer((s) => s.selectSite);
  const map = useMap();
  const selected = sites.find((s) => s.id === selectedId);

  useEffect(() => {
    if (selected) map.flyTo([selected.lat, selected.lon], Math.max(map.getZoom(), 4), { duration: 0.8 });
  }, [map, selected]);

  return (
    <>
      {sites.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lon]}
          icon={pinIcon(s.name, s.id === selectedId)}
          title={`${s.name}, ${s.region}`}
          keyboard
          eventHandlers={{ click: () => selectSite(s.id) }}
        />
      ))}
    </>
  );
}

export default function WorldMap({ world }: { world: World }) {
  const bases = useMemo(() => baseLayersFor(world), [world]);
  const chosen = useMapLayers((s) => s.base[world]);
  const base = bases.find((l) => l.id === chosen) ?? bases[0];

  return (
    <>
      <MapContainer
        key={world}
        crs={world === "earth" ? GIBS_CRS : L.CRS.EPSG4326}
        center={[0, 0]}
        zoom={2}
        minZoom={0}
        maxZoom={11}
        zoomSnap={0.25}
        zoomDelta={0.5}
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1}
        zoomControl={false}
        worldCopyJump={false}
        className="size-full bg-background"
      >
        <TileLayer key={base.id} {...tileProps(base)} zIndex={1} />
        <ScienceOverlay world={world} />
        <SitePins world={world} />
        <PointerTracker world={world} />
        <FitWorld />
      </MapContainer>
      <LayerPanel world={world} />
    </>
  );
}
