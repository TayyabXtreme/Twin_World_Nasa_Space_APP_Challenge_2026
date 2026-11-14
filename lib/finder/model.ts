import type { CellResult, CoreKey, DimId, DimSpec, GridHeader, RefPoint, Target, Weights } from "./types";
import { DIM_IDS } from "./types";

/**
 * The Analog Finder maths (docs/archive/plan-v2.md §4.1, §6.1), free of DOM and React so it runs in a Web Worker.
 *
 * Per dimension a similarity s ∈ [0, 1]:
 *   role      s = exp(−½ ((p_earth − p_target) / σ_role)²)       percentiles within each world
 *   bare      s = exp(−½ (max(0, NDVI − 0.03) / 0.10)²)          absolute: Moon and Mars have NDVI 0
 *   sun       s = exp(−½ ((E_earth − E_target) / 10°)²)          absolute: highest noon Sun of the year
 *   relief    s = exp(−½ (ln((r+20)/(r_t+20)) / ln 2.2)²)        absolute: metres of relief over ~66 km
 * Overall S = Σ w_d s_d / Σ w_d. Missing Earth data counts as no match (relief: 0.5, it is unknown
 * south of 84°S and on small islands).
 * Every similarity depends only on a quantised byte (or the row), so each one is a 256-entry lookup table.
 */

export const SIGMA_ROLE = 0.12;
export const NDVI_TOL = 0.1;
export const SUN_SIGMA = 10;
export const RELIEF_LOG_SIGMA = Math.log(2.2);
export const EARTH_OBLIQUITY = 23.44;
export const CLUSTER_KM = 350;

const ROLE_CHANNEL: Partial<Record<DimId, CoreKey>> = { cold: "tmean", swing: "swing", inertia: "ati", ice: "freeze" };
export const CORE_KEYS: CoreKey[] = ["tmean", "swing", "ndvi", "ati", "freeze", "relief"];
export const roleChannel = (d: DimId) => ROLE_CHANNEL[d];

export interface Grid {
  header: GridHeader;
  n: number;
  nx: number;
  ny: number;
  /** cell -> grid index (row * nx + col) */
  gridIndex: Int32Array;
  /** grid index -> cell, −1 over the ocean */
  cellOf: Int32Array;
  row: Uint16Array;
  lat: Float32Array;
  lon: Float32Array;
  area: Float32Array;
  areaTotal: number;
  ch: Record<CoreKey, Uint8Array>;
  pct: Partial<Record<CoreKey, Float32Array>>;
}

export function decodeGrid(header: GridHeader, core: ArrayBuffer): Grid {
  const { nx, ny, cells: n, res } = header.grid;
  const bytes = new Uint8Array(core);
  const gridIndex = new Int32Array(n);
  const cellOf = new Int32Array(nx * ny).fill(-1);
  let k = 0;
  for (let g = 0; g < nx * ny; g++) {
    if (bytes[g >> 3] & (1 << (g & 7))) {
      gridIndex[k] = g;
      cellOf[g] = k;
      k++;
    }
  }
  const row = new Uint16Array(n);
  const lat = new Float32Array(n);
  const lon = new Float32Array(n);
  const area = new Float32Array(n);
  let areaTotal = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(gridIndex[i] / nx);
    const c = gridIndex[i] - r * nx;
    row[i] = r;
    lat[i] = 90 - (r + 0.5) * res;
    lon[i] = -180 + (c + 0.5) * res;
    area[i] = Math.cos((lat[i] * Math.PI) / 180);
    areaTotal += area[i];
  }
  const ch = {} as Record<CoreKey, Uint8Array>;
  const pct: Partial<Record<CoreKey, Float32Array>> = {};
  for (const c of header.channels) {
    if (c.file !== "core") continue;
    ch[c.key as CoreKey] = bytes.subarray(c.byteOffset, c.byteOffset + n);
    if (c.pct) pct[c.key as CoreKey] = Float32Array.from(c.pct);
  }
  return { header, n, nx, ny, gridIndex, cellOf, row, lat, lon, area, areaTotal, ch, pct };
}

/** Decoded physical value of a quantised byte (NaN for 0 = no data). */
export function valueOf(header: GridHeader, key: string, q: number) {
  const c = header.channels.find((x) => x.key === key);
  if (!c || q === 0) return NaN;
  const v = c.offset + (q - 1) * c.scale;
  if (!c.log) return v;
  return key === "relief" ? 10 ** v - 1 : 10 ** v;
}

export const maxSun = (lat: number, obliquity: number) => Math.min(90, 90 - Math.abs(lat) + obliquity);

/** Lookup tables: per dimension, similarity for each of the 256 quantised levels (sun: per grid row). */
export function buildLuts(grid: Grid, target: Target) {
  const luts: Partial<Record<DimId, Float32Array>> = {};
  for (const d of DIM_IDS) {
    const spec: DimSpec | undefined = target.dims[d];
    if (!spec) continue;
    const roleKey = ROLE_CHANNEL[d];
    if (roleKey) {
      const pct = grid.pct[roleKey]!;
      const t = spec.earthPct ?? 0.5;
      const lut = new Float32Array(256);
      for (let q = 1; q < 256; q++) lut[q] = Math.exp(-0.5 * ((pct[q] - t) / SIGMA_ROLE) ** 2);
      luts[d] = lut;
    } else if (d === "bare") {
      const lut = new Float32Array(256);
      for (let q = 1; q < 256; q++) {
        const v = valueOf(grid.header, "ndvi", q);
        lut[q] = Math.exp(-0.5 * (Math.max(0, v - 0.03) / NDVI_TOL) ** 2);
      }
      luts[d] = lut;
    } else if (d === "relief") {
      const rt = spec.earthTarget ?? 100;
      const lut = new Float32Array(256);
      lut[0] = 0.5;
      for (let q = 1; q < 256; q++) {
        const v = valueOf(grid.header, "relief", q);
        lut[q] = Math.exp(-0.5 * (Math.log((v + 20) / (rt + 20)) / RELIEF_LOG_SIGMA) ** 2);
      }
      luts[d] = lut;
    } else if (d === "sun") {
      const et = spec.earthTarget ?? 45;
      const lut = new Float32Array(grid.ny);
      for (let r = 0; r < grid.ny; r++) {
        const la = 90 - (r + 0.5) * grid.header.grid.res;
        lut[r] = Math.exp(-0.5 * ((maxSun(la, EARTH_OBLIQUITY) - et) / SUN_SIGMA) ** 2);
      }
      luts[d] = lut;
    }
  }
  return luts;
}

const CHANNEL_FOR: Record<DimId, CoreKey | "row"> = {
  cold: "tmean",
  swing: "swing",
  bare: "ndvi",
  inertia: "ati",
  ice: "freeze",
  relief: "relief",
  sun: "row",
};

export function scoreAll(grid: Grid, target: Target, weights: Weights, out: Float32Array) {
  const luts = buildLuts(grid, target);
  const active = DIM_IDS.filter((d) => luts[d] && weights[d] > 0);
  out.fill(0);
  let wsum = 0;
  for (const d of active) {
    const w = weights[d];
    wsum += w;
    const lut = luts[d]!;
    const src = CHANNEL_FOR[d];
    if (src === "row") {
      const row = grid.row;
      for (let i = 0; i < grid.n; i++) out[i] += w * lut[row[i]];
    } else {
      const q = grid.ch[src];
      for (let i = 0; i < grid.n; i++) out[i] += w * lut[q[i]];
    }
  }
  if (wsum > 0) for (let i = 0; i < grid.n; i++) out[i] /= wsum;
  return luts;
}

/** Area-weighted histogram of scores, to turn any score into "top x % of Earth's land". */
export function scoreRanker(grid: Grid, scores: Float32Array, bins = 2000) {
  const hist = new Float64Array(bins + 1);
  for (let i = 0; i < grid.n; i++) hist[Math.min(bins, Math.floor(scores[i] * bins))] += grid.area[i];
  // above[b] = area share strictly above bin b
  const above = new Float64Array(bins + 1);
  let acc = 0;
  for (let b = bins; b >= 0; b--) {
    above[b] = acc / grid.areaTotal;
    acc += hist[b];
  }
  const topPct = (s: number) => {
    const b = Math.min(bins, Math.floor(s * bins));
    return (above[b] + (hist[b] / grid.areaTotal) * 0.5) * 100;
  };
  // score at a given area quantile (from the top)
  const scoreAtTop = (share: number) => {
    let a = 0;
    for (let b = bins; b >= 0; b--) {
      a += hist[b] / grid.areaTotal;
      if (a >= share) return b / bins;
    }
    return 0;
  };
  return { topPct, scoreAtTop };
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * p) / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function cellResult(grid: Grid, target: Target, luts: Partial<Record<DimId, Float32Array>>, scores: Float32Array, rank: (s: number) => number, i: number): CellResult {
  const sims: Partial<Record<DimId, number>> = {};
  for (const d of DIM_IDS) {
    const lut = luts[d];
    if (!lut || !target.dims[d]) continue;
    const src = CHANNEL_FOR[d];
    sims[d] = src === "row" ? lut[grid.row[i]] : lut[grid.ch[src][i]];
  }
  const q = {} as Record<CoreKey, number>;
  const pct: Partial<Record<CoreKey, number>> = {};
  for (const k of CORE_KEYS) {
    q[k] = grid.ch[k][i];
    const table = grid.pct[k];
    if (table && q[k] > 0) pct[k] = table[q[k]];
  }
  return { cell: i, lat: grid.lat[i], lon: grid.lon[i], score: scores[i], topPct: rank(scores[i]), sims, q, pct };
}

/**
 * Distinct places: walk cells from the best score down and keep one only if it is at least CLUSTER_KM from
 * every place already kept. Only the top ~3 % of cells are sorted.
 */
export function topPlaces(grid: Grid, scores: Float32Array, threshold: number, count = 10, sepKm = CLUSTER_KM) {
  const cand: number[] = [];
  for (let i = 0; i < grid.n; i++) if (scores[i] >= threshold) cand.push(i);
  cand.sort((a, b) => scores[b] - scores[a]);
  const picks: number[] = [];
  for (const i of cand) {
    let ok = true;
    for (const j of picks) {
      if (haversine(grid.lat[i], grid.lon[i], grid.lat[j], grid.lon[j]) < sepKm) {
        ok = false;
        break;
      }
    }
    if (ok) picks.push(i);
    if (picks.length >= count) break;
  }
  return picks;
}

/** Land cells within radiusKm of a point (nearest land cell if none). */
export function cellsNear(grid: Grid, lat: number, lon: number, radiusKm: number) {
  const res = grid.header.grid.res;
  const dr = Math.ceil(radiusKm / 111 / res) + 1;
  const r0 = Math.floor((90 - lat) / res);
  const c0 = Math.floor((lon + 180) / res);
  const dc = Math.min(grid.nx / 2, Math.ceil(dr / Math.max(0.05, Math.cos((lat * Math.PI) / 180))));
  const out: number[] = [];
  let nearest = -1;
  let nearestKm = Infinity;
  for (let r = Math.max(0, r0 - dr * 3); r <= Math.min(grid.ny - 1, r0 + dr * 3); r++) {
    for (let c = c0 - dc * 3; c <= c0 + dc * 3; c++) {
      const cc = ((c % grid.nx) + grid.nx) % grid.nx;
      const i = grid.cellOf[r * grid.nx + cc];
      if (i < 0) continue;
      const km = haversine(lat, lon, grid.lat[i], grid.lon[i]);
      if (km <= radiusKm) out.push(i);
      if (km < nearestKm) {
        nearestKm = km;
        nearest = i;
      }
    }
  }
  if (!out.length && nearest >= 0) out.push(nearest);
  return out;
}

/** Score heat ramp (dark violet → magenta → amber → pale gold), alpha rising with the score. */
const STOPS: [number, number, number, number][] = [
  [0, 40, 22, 96],
  [0.35, 122, 40, 140],
  [0.62, 222, 70, 110],
  [0.82, 250, 150, 70],
  [1, 255, 238, 170],
];

export function heatColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  for (let k = 1; k < STOPS.length; k++) {
    if (x <= STOPS[k][0]) {
      const [a0, r0, g0, b0] = STOPS[k - 1];
      const [a1, r1, g1, b1] = STOPS[k];
      const f = (x - a0) / (a1 - a0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  return [255, 238, 170];
}

export const HEAT_CSS = `linear-gradient(90deg, ${STOPS.map(([t, r, g, b]) => `rgb(${r} ${g} ${b}) ${t * 100}%`).join(", ")})`;

export function paintHeat(grid: Grid, scores: Float32Array, lo: number, hi: number, rgba: Uint8ClampedArray) {
  rgba.fill(0);
  const span = Math.max(1e-6, hi - lo);
  const ramp = new Uint8ClampedArray(256 * 4);
  for (let k = 0; k < 256; k++) {
    const t = k / 255;
    const [r, g, b] = heatColor(t);
    ramp[k * 4] = r;
    ramp[k * 4 + 1] = g;
    ramp[k * 4 + 2] = b;
    ramp[k * 4 + 3] = Math.round(255 * (0.18 + 0.78 * t ** 1.1));
  }
  for (let i = 0; i < grid.n; i++) {
    const t = (scores[i] - lo) / span;
    const g = grid.gridIndex[i] * 4;
    if (t <= 0) {
      // Below the ramp: a faint veil so land still reads as "scored, low".
      rgba[g] = 18;
      rgba[g + 1] = 16;
      rgba[g + 2] = 40;
      rgba[g + 3] = 110;
      continue;
    }
    const k = Math.min(255, Math.round(t * 255)) * 4;
    rgba[g] = ramp[k];
    rgba[g + 1] = ramp[k + 1];
    rgba[g + 2] = ramp[k + 2];
    rgba[g + 3] = ramp[k + 3];
  }
}

export interface ScoreRequest {
  type: "score";
  id: number;
  target: Target;
  weights: Weights;
}

export interface ProbeRequest {
  type: "probe";
  id: number;
  lat: number;
  lon: number;
}

export interface InitRequest {
  type: "init";
  header: GridHeader;
  core: ArrayBuffer;
  refs: RefPoint[];
}
