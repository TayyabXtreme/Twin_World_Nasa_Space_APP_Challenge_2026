import { earthDose, longestDaylight, ORBIT, similarity, SOURCE, UNKNOWN } from "./params";
import type {
  CellResult,
  ChannelKey,
  DimId,
  GridHeader,
  ParamChannel,
  ParamsHeader,
  RefPoint,
  Target,
  Weights,
} from "./types";
import { CHANNEL_KEYS, DIM_IDS } from "./types";

/**
 * The Analog Finder maths, free of DOM and React so it runs in a Web Worker.
 *
 * Each of the thirteen parameters gives a similarity s ∈ [0, 1] per Earth land cell (lib/finder/params.ts
 * similarity): closeness to the target's value; where the target lies far beyond anything on Earth (no air,
 * −220 °C), how far the cell goes toward it; for elevation, the same rank within each world.
 * Overall S = Σ w_d s_d / Σ w_d. Missing Earth data counts as half a match (UNKNOWN).
 * Every similarity depends only on a quantised byte, the grid row (daylight) or the cell (water), so each one is a
 * small lookup table.
 */

export const CLUSTER_KM = 350;

export interface Grid {
  header: GridHeader;
  params: ParamsHeader;
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
  ch: Record<ChannelKey, Uint8Array>;
  meta: Record<ChannelKey, ParamChannel>;
  /** Longest-day daylight (h) of each grid row and its area-weighted percentile over Earth's land. */
  rowDaylight: Float32Array;
  rowDaylightPct: Float32Array;
}

/** `buf` is earth-params.bin: the land mask (one bit per grid point, little-endian in each byte), then the channels. */
export function decodeGrid(header: GridHeader, params: ParamsHeader, buf: ArrayBuffer): Grid {
  const { nx, ny, cells: n, res } = header.grid;
  const bytes = new Uint8Array(buf);
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
  const rowArea = new Float64Array(ny);
  let areaTotal = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(gridIndex[i] / nx);
    const c = gridIndex[i] - r * nx;
    row[i] = r;
    lat[i] = 90 - (r + 0.5) * res;
    lon[i] = -180 + (c + 0.5) * res;
    area[i] = Math.cos((lat[i] * Math.PI) / 180);
    rowArea[r] += area[i];
    areaTotal += area[i];
  }
  const ch = {} as Record<ChannelKey, Uint8Array>;
  const meta = {} as Record<ChannelKey, ParamChannel>;
  for (const c of params.channels) {
    ch[c.key] = bytes.subarray(c.byteOffset, c.byteOffset + n);
    meta[c.key] = c;
  }
  // Daylight grows with |latitude|: its percentile is the land area with less daylight, plus half of its own level.
  const rowDaylight = new Float32Array(ny);
  const rowDaylightPct = new Float32Array(ny);
  for (let r = 0; r < ny; r++)
    rowDaylight[r] = longestDaylight(90 - (r + 0.5) * res, ORBIT.earth.obliquity, ORBIT.earth.day);
  const order = Array.from({ length: ny }, (_, r) => r).sort((a, b) => rowDaylight[a] - rowDaylight[b]);
  let below = 0;
  for (let j = 0; j < ny; ) {
    let m = j;
    let tie = 0;
    while (m < ny && rowDaylight[order[m]] === rowDaylight[order[j]]) tie += rowArea[order[m++]];
    for (let t = j; t < m; t++) rowDaylightPct[order[t]] = (below + tie / 2) / areaTotal;
    below += tie;
    j = m;
  }
  return { header, params, n, nx, ny, gridIndex, cellOf, row, lat, lon, area, areaTotal, ch, meta, rowDaylight, rowDaylightPct };
}

/** Decoded physical value of a quantised byte (NaN for 0 = no data). */
export function channelValue(c: ParamChannel | undefined, q: number) {
  if (!c || q === 0) return NaN;
  const v = c.offset + (q - 1) * c.scale;
  return c.log ? 10 ** v - 1 : v;
}

/** Physical Earth values of one cell, keyed by channel. */
export function cellValues(params: ParamsHeader, q: Record<ChannelKey, number>) {
  const out = {} as Record<ChannelKey, number>;
  for (const c of params.channels) out[c.key] = channelValue(c, q[c.key]);
  return out;
}

export type Luts = Partial<Record<DimId, Float32Array>>;
export type RefCells = { ref: RefPoint; cells: number[] }[];

/**
 * Lookup tables: per parameter, the similarity for each of the 256 quantised levels of its channel (daylight: per
 * grid row; water: per cell, set around the catalogued sites in `refCells`, unknown elsewhere).
 */
export function buildLuts(grid: Grid, target: Target, refCells: RefCells): Luts {
  const luts: Luts = {};
  for (const d of DIM_IDS) {
    const spec = target.params[d];
    if (!spec) continue;
    const src = SOURCE[d];
    if (src === "row") {
      const lut = new Float32Array(grid.ny);
      for (let r = 0; r < grid.ny; r++) lut[r] = similarity(d, spec, grid.rowDaylight[r], grid.rowDaylightPct[r]);
      luts[d] = lut;
    } else if (src === "cell") {
      const lut = new Float32Array(grid.n).fill(UNKNOWN);
      for (const { ref, cells } of refCells) {
        if (ref.water === undefined) continue;
        const s = ref.water === (spec.v === 1) ? 1 : 0;
        for (const i of cells) lut[i] = s;
      }
      luts[d] = lut;
    } else {
      const c = grid.meta[src];
      const lut = new Float32Array(256);
      lut[0] = UNKNOWN;
      for (let q = 1; q < 256; q++) {
        const v = channelValue(c, q);
        lut[q] = similarity(d, spec, d === "radiation" ? earthDose(v) : v, c.pct[q]);
      }
      luts[d] = lut;
    }
  }
  return luts;
}

function simAt(grid: Grid, d: DimId, lut: Float32Array, i: number) {
  const src = SOURCE[d];
  return src === "row" ? lut[grid.row[i]] : src === "cell" ? lut[i] : lut[grid.ch[src][i]];
}

export function scoreAll(grid: Grid, luts: Luts, weights: Weights, out: Float32Array) {
  out.fill(0);
  let wsum = 0;
  for (const d of DIM_IDS) {
    const lut = luts[d];
    const w = weights[d] ?? 0;
    if (!lut || w <= 0) continue;
    wsum += w;
    const src = SOURCE[d];
    if (src === "row") {
      const row = grid.row;
      for (let i = 0; i < grid.n; i++) out[i] += w * lut[row[i]];
    } else if (src === "cell") {
      for (let i = 0; i < grid.n; i++) out[i] += w * lut[i];
    } else {
      const q = grid.ch[src];
      for (let i = 0; i < grid.n; i++) out[i] += w * lut[q[i]];
    }
  }
  if (wsum > 0) for (let i = 0; i < grid.n; i++) out[i] /= wsum;
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

export function cellResult(grid: Grid, target: Target, luts: Luts, scores: Float32Array, rank: (s: number) => number, i: number): CellResult {
  const sims: Partial<Record<DimId, number>> = {};
  for (const d of DIM_IDS) {
    const lut = luts[d];
    if (lut && target.params[d]) sims[d] = simAt(grid, d, lut, i);
  }
  const q = {} as Record<ChannelKey, number>;
  for (const k of CHANNEL_KEYS) q[k] = grid.ch[k]?.[i] ?? 0;
  return { cell: i, lat: grid.lat[i], lon: grid.lon[i], score: scores[i], topPct: rank(scores[i]), sims, q };
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
  params: ParamsHeader;
  buf: ArrayBuffer;
  refs: RefPoint[];
}
