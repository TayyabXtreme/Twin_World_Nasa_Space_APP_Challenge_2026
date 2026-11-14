import { decodeGreyPng } from "./png";
import { cellAt, toXY } from "./projection";
import type { Grid, LayerMeta, Manifest, PointValue, SiteValues } from "./types";

export const DATA_BASE = "/data/moonbase";

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch(`${DATA_BASE}/manifest.json`);
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  return res.json();
}

export async function loadSiteValues(): Promise<SiteValues | null> {
  const res = await fetch(`${DATA_BASE}/site-values.json`);
  return res.ok ? res.json() : null;
}

export async function loadGrid(layer: LayerMeta): Promise<Grid> {
  if (!layer.grid) throw new Error(`${layer.id} has no grid`);
  const res = await fetch(`${DATA_BASE}/${layer.grid.file}`);
  if (!res.ok) throw new Error(`${layer.grid.file} ${res.status}`);
  const { width, height, data } = await decodeGreyPng(await res.arrayBuffer());
  if (width !== height) throw new Error("value grids are square");
  return { size: width, dn: data, meta: layer.grid };
}

/** A layer's uncertainty grid, stored next to its value grid under this key. */
export const errKey = (id: string) => `${id}:err`;

/** "± 0.6" for a layer with an uncertainty grid at this point, else "". */
export function formatError(layer: Pick<LayerMeta, "decimals">, err: PointValue): string {
  return typeof err === "number" ? ` ± ${err.toFixed(layer.decimals)}` : "";
}

/** Physical value of one cell: number, "none" (ice depth: deeper than 2.87 m, PRP -999) or null (no data). */
export function cellValue(grid: Grid, index: number): PointValue {
  const dn = grid.dn[index];
  if (dn === grid.meta.nodata) return null;
  if (grid.meta.none !== undefined && dn === grid.meta.none) return "none";
  return grid.meta.offset + dn * grid.meta.scale;
}

export function valueAtXY(grid: Grid, x: number, y: number): PointValue {
  const c = cellAt(x, y, grid.size);
  return c ? cellValue(grid, c.row * grid.size + c.col) : null;
}

export function valueAtLatLon(grid: Grid, lat: number, lon: number): PointValue {
  const [x, y] = toXY(lat, lon);
  return valueAtXY(grid, x, y);
}

/** Decode a whole grid to Float32 physical values (NaN = no data; ice "none" = +Infinity). */
export function toFloat(grid: Grid): Float32Array {
  const out = new Float32Array(grid.dn.length);
  const { offset, scale, nodata, none } = grid.meta;
  for (let i = 0; i < out.length; i++) {
    const dn = grid.dn[i];
    out[i] = dn === nodata ? NaN : none !== undefined && dn === none ? Infinity : offset + dn * scale;
  }
  return out;
}

export function formatValue(layer: Pick<LayerMeta, "decimals" | "units">, v: PointValue): string {
  if (v === null) return "no data";
  if (v === "none") return "> 2.87 m deep";
  const n = v.toLocaleString("en-US", { minimumFractionDigits: layer.decimals, maximumFractionDigits: layer.decimals });
  return layer.units === "ratio" ? n : `${n} ${layer.units}`;
}
