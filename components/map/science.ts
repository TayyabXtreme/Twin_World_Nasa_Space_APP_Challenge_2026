"use client";

import { create } from "zustand";
import { legendUrl, type Legend, type MapLayer, type TileMapLayer } from "@/lib/layers";
import type { World } from "@/lib/worlds";

/**
 * Client state and data access for the 2D map's layers: chosen base map per world, science-overlay opacity, the
 * value readout, and lazily fetched legends and value grids (each fetched once, only when needed).
 */

export interface Probe {
  lat: number;
  lon: number;
  /** "value" = a reading; "none" = no data at this point; "loading" = tile/grid still being read. */
  status: "value" | "none" | "loading" | "outside";
  text?: string;
}

interface MapLayerState {
  base: Partial<Record<World, string>>;
  opacity: number;
  legends: Record<string, Legend | null>;
  grids: Record<string, Uint16Array | null>;
  /** Value under the pointer (desktop hover). */
  hoverProbe: Probe | null;
  /** Value at the last click or tap; shown with a marker. */
  pinProbe: Probe | null;
  setBase: (world: World, id: string) => void;
  setOpacity: (opacity: number) => void;
  setHoverProbe: (p: Probe | null) => void;
  setPinProbe: (p: Probe | null) => void;
}

export const useMapLayers = create<MapLayerState>()((set) => ({
  base: {},
  opacity: 0.8,
  legends: {},
  grids: {},
  hoverProbe: null,
  pinProbe: null,
  setBase: (world, id) => set((s) => ({ base: { ...s.base, [world]: id } })),
  setOpacity: (opacity) => set({ opacity }),
  setHoverProbe: (hoverProbe) => set({ hoverProbe }),
  setPinProbe: (pinProbe) => set({ pinProbe }),
}));

const pending = new Set<string>();

/** Fetch a legend once; the store holds `null` if it is missing (layer not built yet). */
export function ensureLegend(id: string) {
  const { legends } = useMapLayers.getState();
  if (id in legends || pending.has(id)) return;
  pending.add(id);
  fetch(legendUrl(id))
    .then((r) => (r.ok ? (r.json() as Promise<Legend>) : null))
    .catch(() => null)
    .then((legend) => {
      pending.delete(id);
      useMapLayers.setState((s) => ({ legends: { ...s.legends, [id]: legend } }));
    });
}

/** Fetch an image layer's value grid once (after its legend is known). */
export function ensureGrid(legend: Legend) {
  const key = `grid:${legend.id}`;
  if (!legend.grid || legend.id in useMapLayers.getState().grids || pending.has(key)) return;
  pending.add(key);
  const { url, width, height } = legend.grid;
  fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null)
    .then((buf) => {
      pending.delete(key);
      // Grids are little-endian; every browser we target is little-endian too, so a typed-array view is exact.
      const grid = buf && buf.byteLength === width * height * 2 ? new Uint16Array(buf) : null;
      useMapLayers.setState((s) => ({ grids: { ...s.grids, [legend.id]: grid } }));
    });
}

export function formatValue(legend: Legend, v: number) {
  const d = legend.decimals ?? 1;
  const n = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(d);
  return `${n === "-0" || n === "-0.0" ? n.slice(1) : n} ${legend.units}`;
}

/** Value of a precomputed layer at a point, or a status if there is none. */
export function sampleGrid(legend: Legend, grid: Uint16Array, lat: number, lon: number): Probe {
  const g = legend.grid!;
  const [[south, west], [north, east]] = legend.bounds!;
  if (lat > north || lat < south || lon < west || lon > east) return { lat, lon, status: "outside" };
  const row = Math.min(g.height - 1, Math.floor(((north - lat) / (north - south)) * g.height));
  const col = Math.min(g.width - 1, Math.floor(((lon - west) / (east - west)) * g.width));
  const q = grid[row * g.width + col];
  if (!q) return { lat, lon, status: "none" };
  return { lat, lon, status: "value", text: formatValue(legend, g.offset + (q - 1) * g.scale) };
}

/** The colour map row for a pixel: exact match first (GIBS tiles are palette PNGs), else the nearest colour. */
function lookupColour(table: NonNullable<Legend["table"]>, r: number, g: number, b: number) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < table.length; i++) {
    const t = table[i];
    const d = (t[0] - r) ** 2 + (t[1] - g) ** 2 + (t[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
      if (d === 0) break;
    }
  }
  return bestD <= 48 ? best : -1;
}

function describeRow(legend: Legend, i: number) {
  const table = legend.table!;
  const n = table.length;
  const width = (k: number) => table[k][4] - table[k][3];
  const [, , , a, b] = table[i];
  // The first and last rows are often catch-alls ("< 200 K", ">= 350 K"), much wider than the rest.
  if (n > 2 && i === 0 && width(0) > 5 * width(1)) return `< ${formatValue(legend, b)}`;
  if (n > 2 && i === n - 1 && width(n - 1) > 5 * width(n - 2)) return `≥ ${formatValue(legend, a)}`;
  return formatValue(legend, (a + b) / 2);
}

const tileImages = new Map<string, Promise<ImageData | null>>();

function loadTile(url: string) {
  let p = tileImages.get(url);
  if (!p) {
    p = new Promise<ImageData | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0);
          resolve(ctx.getImageData(0, 0, c.width, c.height));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    tileImages.set(url, p);
    if (tileImages.size > 24) tileImages.delete(tileImages.keys().next().value!);
  }
  return p;
}

/**
 * Read a GIBS layer's value at a point from the tile the map is showing: GIBS level-0 pixels are 0.5625°, halving per
 * level, 512 px tiles anchored at 180°W 90°N. The pixel colour is looked up in the official GIBS colour map.
 */
export async function sampleGibs(layer: TileMapLayer, legend: Legend, lat: number, lon: number, mapZoom: number): Promise<Probe> {
  if (!legend.table?.length) return { lat, lon, status: "none" };
  const z = Math.max(0, Math.min(layer.maxNativeZoom, Math.round(mapZoom)));
  const res = 0.5625 / 2 ** z;
  const gx = (lon + 180) / res;
  const gy = (90 - lat) / res;
  const col = Math.floor(gx / 512);
  const row = Math.floor(gy / 512);
  const url = layer.url.replace("{z}", String(z)).replace("{y}", String(row)).replace("{x}", String(col));
  const data = await loadTile(url);
  if (!data) return { lat, lon, status: "none" };
  const px = Math.min(data.width - 1, Math.floor(gx - col * 512));
  const py = Math.min(data.height - 1, Math.floor(gy - row * 512));
  const o = (py * data.width + px) * 4;
  if (data.data[o + 3] < 128) return { lat, lon, status: "none" };
  const i = lookupColour(legend.table, data.data[o], data.data[o + 1], data.data[o + 2]);
  return i < 0 ? { lat, lon, status: "none" } : { lat, lon, status: "value", text: describeRow(legend, i) };
}

export function canProbe(layer: MapLayer | undefined, legend: Legend | null | undefined) {
  if (!layer || !legend) return false;
  return layer.type === "image" ? Boolean(legend.grid) : Boolean(legend.table?.length);
}
