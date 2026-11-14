/**
 * Base suitability, computed in the browser from the value grids. Each factor turns one layer into a 0–1 score
 * with a simple linear rule; the map shows the weighted mean of the factors the user has switched on:
 *
 *   suitability = Σ wᵢ · sᵢ(layerᵢ) / Σ wᵢ        (cells missing any weighted layer are left blank)
 *
 * The thresholds are planning heuristics, not NASA requirements, except where noted (lander slope < 8°).
 */

export type FactorId = "gentle" | "smooth" | "ice" | "sun" | "high" | "radar";

export interface Factor {
  id: FactorId;
  label: string;
  layer: string;
  /** Plain-language rule shown under the slider. */
  rule: string;
  why: string;
  defaultWeight: number;
  score: (v: number) => number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const FACTORS: Factor[] = [
  {
    id: "gentle",
    label: "Gentle slope",
    layer: "slope",
    rule: "full marks at ≤ 4°, zero at ≥ 12°",
    why: "Landers tip and rovers slip on steep ground; the Artemis lander needs < 8°.",
    defaultWeight: 3,
    score: (v) => clamp01((12 - v) / 8),
  },
  {
    id: "smooth",
    label: "Even ground",
    layer: "ruggedness",
    rule: "full marks at ≤ 1° slope spread, zero at ≥ 4°",
    why: "Broken ground means more boulders, pits and crater walls to drive around.",
    defaultWeight: 1,
    score: (v) => clamp01((4 - v) / 3),
  },
  {
    id: "ice",
    label: "Cold trap nearby",
    layer: "trapdist",
    rule: "full marks next to a cold trap, zero at ≥ 20 km",
    why: "Water ice is the reason to go: drinking water, oxygen and rocket fuel.",
    defaultWeight: 3,
    score: (v) => clamp01(1 - v / 20),
  },
  {
    id: "sun",
    label: "Sunlit ground",
    layer: "tavg",
    rule: "zero at ≤ 90 K average, full marks at ≥ 160 K",
    why: "A warm annual average means the Sun reaches the spot often: solar power and milder nights.",
    defaultWeight: 2,
    score: (v) => clamp01((v - 90) / 70),
  },
  {
    id: "high",
    label: "High ground",
    layer: "relief",
    rule: "zero at ≤ −200 m, full marks at ≥ +1000 m above the ~30 km surroundings",
    why: "With the Sun skimming the horizon, ridges and peaks stay lit longest (a proxy, not a light model).",
    defaultWeight: 1,
    score: (v) => clamp01((v + 200) / 1200),
  },
  {
    id: "radar",
    label: "Few blocky rocks (radar)",
    layer: "cpr",
    rule: "full marks at CPR ≤ 0.4, zero at ≥ 1.0",
    why: "Low radar CPR means few decimetre-scale blocks. High CPR can also mean ice, so keep this weight low.",
    defaultWeight: 0.5,
    score: (v) => clamp01((1 - v) / 0.6),
  },
];

export type Weights = Record<FactorId, number>;

export const DEFAULT_WEIGHTS = Object.fromEntries(FACTORS.map((f) => [f.id, f.defaultWeight])) as Weights;

/** Weighted suitability for every cell; NaN where a weighted layer has no data. */
export function computeSuitability(layers: Partial<Record<string, Float32Array>>, weights: Weights, size: number) {
  const active = FACTORS.filter((f) => weights[f.id] > 0 && layers[f.layer]);
  const out = new Float32Array(size * size).fill(NaN);
  const total = active.reduce((s, f) => s + weights[f.id], 0);
  if (!active.length || total <= 0) return { scores: out, active };
  const arrays = active.map((f) => layers[f.layer] as Float32Array);
  const ws = active.map((f) => weights[f.id] / total);
  const fns = active.map((f) => f.score);
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    let ok = true;
    for (let k = 0; k < arrays.length; k++) {
      const v = arrays[k][i];
      if (Number.isNaN(v)) {
        ok = false;
        break;
      }
      s += ws[k] * fns[k](v);
    }
    if (ok) out[i] = s;
  }
  return { scores: out, active };
}

/** Score breakdown at one cell, for the readout. */
export function breakdownAt(layers: Partial<Record<string, Float32Array>>, weights: Weights, index: number) {
  return FACTORS.filter((f) => weights[f.id] > 0 && layers[f.layer]).map((f) => {
    const v = (layers[f.layer] as Float32Array)[index];
    return { factor: f, value: v, score: Number.isNaN(v) ? null : f.score(v) };
  });
}

/** Best cells, at least `minSepKm` apart. */
export function topSpots(scores: Float32Array, size: number, pixelKm: number, count = 5, minSepKm = 30) {
  // threshold from a histogram so we only sort the top ~0.5 %
  const bins = new Uint32Array(1001);
  let n = 0;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (!Number.isNaN(s)) {
      bins[Math.round(s * 1000)]++;
      n++;
    }
  }
  if (!n) return [];
  let acc = 0;
  let cut = 1000;
  while (cut > 0 && acc + bins[cut] < Math.max(200, n * 0.005)) acc += bins[cut--];
  const thr = cut / 1000;
  const cand: number[] = [];
  for (let i = 0; i < scores.length; i++) if (scores[i] >= thr) cand.push(i);
  cand.sort((a, b) => scores[b] - scores[a]);
  const picked: { index: number; row: number; col: number; score: number }[] = [];
  const sep = minSepKm / pixelKm;
  for (const i of cand) {
    const row = Math.floor(i / size);
    const col = i % size;
    if (picked.every((p) => Math.hypot(p.row - row, p.col - col) >= sep)) {
      picked.push({ index: i, row, col, score: scores[i] });
      if (picked.length >= count) break;
    }
  }
  return picked;
}

/** 256-entry RGBA lookup table from hex ramp stops. */
export function rampLut(stops: string[]): Uint8ClampedArray {
  const rgb = stops.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (rgb.length - 1);
    const k = Math.min(Math.floor(t), rgb.length - 2);
    const f = t - k;
    for (let c = 0; c < 3; c++) lut[i * 4 + c] = rgb[k][c] * (1 - f) + rgb[k + 1][c] * f;
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

export const SUIT_RAMP = ["#2b0f3a", "#5a1d5c", "#8f2f5f", "#c4515a", "#e5814f", "#f2b45a", "#f6e27a", "#d7f59a", "#9ff5c4"];

/** Paint scores into a canvas (one pixel per cell); blank cells stay transparent. */
export function paintScores(canvas: HTMLCanvasElement, scores: Float32Array, size: number, lut: Uint8ClampedArray) {
  if (canvas.width !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (Number.isNaN(s)) continue;
    const k = Math.round(s * 255) * 4;
    d[i * 4] = lut[k];
    d[i * 4 + 1] = lut[k + 1];
    d[i * 4 + 2] = lut[k + 2];
    d[i * 4 + 3] = 225;
  }
  ctx.putImageData(img, 0, 0);
}
