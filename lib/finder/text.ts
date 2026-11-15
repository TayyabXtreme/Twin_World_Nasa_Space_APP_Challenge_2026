import type { World } from "@/lib/worlds";
import { channelValue } from "./model";
import { DIM_LABEL, DIM_UNITS, earthDose, longestDaylight, ORBIT, SOURCE, UNKNOWN } from "./params";
import { type CellResult, DIM_IDS, type DimId, type ParamSpec, type ParamsHeader, type Target, type Weights } from "./types";

export { DEFAULT_WEIGHTS, DIM_HINT, DIM_LABEL, DIM_SHORT, DIM_UNITS } from "./params";

/** Words for the Analog Finder: readouts of each parameter, strengths, limits and field tests. */

export const WORLD_LIMITS: Record<Exclude<World, "earth">, { title: string; text: string }[]> = {
  moon: [
    { title: "Gravity", text: "1.62 m/s², one sixth of Earth's. Dust, regolith mechanics, walking and drilling all behave differently." },
    { title: "Vacuum", text: "No air at all. No wind, no convection, no sound; dust is lifted by electrostatics and rocket plumes, not weather." },
    { title: "Radiation", text: "No magnetic field or atmosphere to shield the surface, so galactic cosmic rays and solar storms arrive unblocked (NASA LRO CRaTER)." },
    { title: "Temperature", text: "Lunar polar cold traps fall below −230 °C. The coldest ground ever measured on Earth is about −98 °C (East Antarctica, Scambos et al. 2018)." },
  ],
  mars: [
    { title: "Gravity", text: "3.71 m/s², 38 % of Earth's. Soil strength, dust settling and rover traction differ." },
    { title: "Atmosphere", text: "About 0.6 kPa of CO₂, under 1 % of Earth's pressure: liquid water boils or freezes quickly at the surface." },
    { title: "Radiation", text: "About 0.64 mSv per day at Gale (Curiosity RAD, Hassler et al. 2014), roughly 100× sea level on Earth." },
    { title: "Chemistry", text: "Perchlorate-rich, oxidising soils and no ozone layer: UV sterilises the top millimetres. No Earth desert is fully lifeless." },
  ],
};

const pctText = (p: number) => {
  const v = p * 100;
  if (v < 0.1) return "<0.1";
  if (v > 99.9) return ">99.9";
  return v < 1 || v > 99 ? v.toFixed(1) : v.toFixed(0);
};

const DIGITS: Record<DimId, number> = {
  tmean: 0,
  trange: 0,
  radiation: 2,
  slope: 2,
  sand: 0,
  pressure: 1,
  daylight: 1,
  precip: 0,
  rh: 0,
  aod: 2,
  isolation: 0,
  elev: 0,
  water: 0,
};

/** A parameter value in words with units ("−63 °C", "225 million km", "0 kPa (vacuum)"). */
export function formatValue(d: DimId, v: number) {
  if (!Number.isFinite(v)) return "–";
  if (d === "pressure" && v < 0.01) return "0 kPa (vacuum)";
  if (d === "isolation" && v >= 1e6) return `${Math.round(v / 1e6).toLocaleString("en-US")} million km`;
  const big = (d === "daylight" || d === "radiation") && v >= 100;
  const digits = v === 0 || big ? 0 : d === "pressure" && v < 10 ? 2 : DIGITS[d];
  const n = v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).replace("-", "−");
  return `${n}${d === "sand" ? " % sand" : d === "rh" ? " %" : DIM_UNITS[d] ? ` ${DIM_UNITS[d]}` : ""}`;
}

/** Where the target lies beyond Earth's range: which Earth land ranks best instead. */
const TOWARD: Record<DimId, [string, string]> = {
  tmean: ["the warmest land", "the coldest land"],
  trange: ["the widest yearly swings", "the steadiest temperatures"],
  radiation: ["high ground (more cosmic rays)", "low ground"],
  slope: ["the steepest ground", "the flattest ground"],
  sand: ["the sandiest soil", "the least sandy soil"],
  pressure: ["the densest air", "the thinnest air (high ground)"],
  daylight: ["the longest summer days (polar land)", "the shortest summer days"],
  precip: ["the wettest land", "the driest land"],
  rh: ["the most humid air", "the driest air"],
  aod: ["the dustiest skies", "the clearest skies"],
  isolation: ["the most remote land", "land near towns"],
  elev: ["the highest land", "the lowest land"],
  water: ["", ""],
};

const WORLD_SURFACE: Record<Exclude<World, "earth">, string> = { moon: "the lunar south polar region", mars: "Mars" };

/**
 * What the target asks of Earth on one parameter, in words. `brief` leaves out how a value beyond Earth's range is
 * ranked (for sentences such as "the target has …").
 */
export function describeTarget(d: DimId, spec: ParamSpec, world: Exclude<World, "earth">, brief = false) {
  if (spec.mode === "match")
    return spec.v === 1 ? "Water-formed minerals or ice" : "No water-formed minerals (dry basalt)";
  if (spec.mode === "rank") return `Higher than ${pctText(spec.pct ?? 0.5)} % of ${WORLD_SURFACE[world]}`;
  const value =
    spec.v === null
      ? d === "radiation"
        ? "Higher than Mars (no surface measurement)"
        : ""
      : `${spec.min ? "≥ " : spec.mode === "toward" ? "" : "≈ "}${formatValue(d, spec.v)}`;
  if (spec.mode !== "toward") return value;
  if (brief) return value ? `${value}, beyond anything on Earth` : "beyond anything on Earth";
  const favours = `the ranking favours ${TOWARD[d][(spec.dir ?? 1) > 0 ? 0 : 1]}`;
  return value ? `${value}: beyond Earth, so ${favours}` : `Beyond Earth, so ${favours}`;
}

/** "Higher than…" -> "higher than…" for use mid-sentence; leaves "≈ 0 %" and acronyms alone. */
const midSentence = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** The Earth cell's own value of one parameter (from the gridded data the ranking uses), or NaN. */
export function earthValue(d: DimId, cell: CellResult, params: ParamsHeader) {
  const src = SOURCE[d];
  if (src === "cell") return NaN;
  if (src === "row") return longestDaylight(cell.lat, ORBIT.earth.obliquity, ORBIT.earth.day);
  const c = params.channels.find((x) => x.key === src);
  const v = channelValue(c, cell.q[src]);
  return d === "radiation" && Number.isFinite(v) ? earthDose(v) : v;
}

export interface DimReadout {
  earth: string;
  target: string;
}

/** Earth value and target value of one parameter, in words with units. */
export function readout(d: DimId, cell: CellResult, target: Target, params: ParamsHeader): DimReadout {
  const spec = target.params[d];
  const v = earthValue(d, cell, params);
  const earth =
    d === "water"
      ? cell.sims.water === UNKNOWN
        ? "not catalogued"
        : cell.sims.water === 1
          ? "matches the target"
          : "does not match the target"
      : Number.isFinite(v)
        ? formatValue(d, v)
        : "no data";
  return { earth, target: spec ? midSentence(describeTarget(d, spec, target.world, true)) : "–" };
}

/**
 * How directly each target value is measured (1 = measured at the site). Mars mean temperature is the planet-wide
 * mean; Mars sand share is a grain-size class from thermal inertia; Moon temperature range is a lower bound.
 */
export const DATA_QUALITY: Record<"moon" | "mars", Record<DimId, number>> = {
  moon: { tmean: 1, trange: 0.7, radiation: 0.4, slope: 1, sand: 0.8, pressure: 1, daylight: 1, precip: 1, rh: 1, aod: 1, isolation: 1, elev: 1, water: 0.9 },
  mars: { tmean: 0.5, trange: 0.7, radiation: 0.8, slope: 1, sand: 0.5, pressure: 0.9, daylight: 1, precip: 1, rh: 0.8, aod: 0.7, isolation: 1, elev: 1, water: 0.9 },
};

/** Earth-side quality: radiation is an estimate from elevation; everything gridded is measured or reanalysed. */
const EARTH_QUALITY: Partial<Record<DimId, number>> = { radiation: 0.7 };

/**
 * Data confidence 0–100: the weighted share of the score that rests on direct measurements, with Earth data present
 * (a missing Earth value, or water at a site that is not catalogued, counts as none).
 */
export function confidence(cell: CellResult, target: Target, weights: Weights) {
  let num = 0;
  let den = 0;
  for (const d of DIM_IDS) {
    if (cell.sims[d] === undefined || !target.params[d]) continue;
    const w = weights[d] ?? 0;
    const src = SOURCE[d];
    const earthOk = src === "row" ? true : src === "cell" ? cell.sims[d] !== UNKNOWN : cell.q[src] > 0;
    num += w * (earthOk ? DATA_QUALITY[target.world][d] * (EARTH_QUALITY[d] ?? 1) : 0);
    den += w;
  }
  return den > 0 ? Math.round((100 * num) / den) : 0;
}

const STRENGTH: Record<DimId, string> = {
  tmean: "A mean temperature as close to the target's as Earth gets",
  trange: "A similar spread between the hottest and coldest of the year",
  radiation: "High ground, with more cosmic radiation than most of Earth",
  slope: "Similar regional slopes over tens of kilometres",
  sand: "A similar sand share in the topsoil",
  pressure: "Thin air: lower surface pressure than most of Earth",
  daylight: "A similar pattern of long summer days",
  precip: "Almost no rain or snow",
  rh: "Very dry air",
  aod: "A similar dust load in the sky",
  isolation: "Far from any town: as isolated as Earth gets",
  elev: "The same height rank on Earth as the target has on its world",
  water: "Water-formed minerals or ice, as at the target",
};

const TEST: Record<DimId, string | ((cell: CellResult) => string)> = {
  tmean: "Cold-soak habitats, batteries, seals and lubricants; thermal-control tests at the low end of Earth's range.",
  trange: "Thermal cycling of structures, solar panels and electronics.",
  radiation: "Radiation-sensor calibration and shielding tests at altitude.",
  slope: "Landing-hazard detection, slope traverses and rover traction.",
  // sand byte 171 ≈ 67 % sand (0–100 % in 254 steps)
  sand: (cell) =>
    cell.q.sand > 170
      ? "Wheel sinkage, trafficability and dust handling on loose sand."
      : "Drilling, coring and anchoring in fine-grained or mixed soil.",
  pressure: "Spacesuit, physiology and engine tests in thin air.",
  daylight: "Solar power, shadows and navigation under long polar days.",
  precip: "Rover traverses, sample caching and the limits of life detection in hyper-arid ground.",
  rh: "Dust handling and desiccation of materials in very dry air.",
  aod: "Dust effects on solar panels, optics and air filters.",
  isolation: "Crew isolation, remote operations and delayed communications.",
  elev: "Instrument and mobility tests at a comparable relative height.",
  water: "Prospecting for and sampling water-formed minerals or ground ice.",
};

export function strengths(cell: CellResult) {
  return (Object.entries(cell.sims) as [DimId, number][])
    .filter(([, s]) => s >= 0.75)
    .sort((a, b) => b[1] - a[1])
    .map(([d]) => ({ dim: d, text: STRENGTH[d] }));
}

export function weaknesses(cell: CellResult, target: Target, params: ParamsHeader) {
  const out: { dim: DimId; text: string }[] = [];
  for (const [d, s] of Object.entries(cell.sims) as [DimId, number][]) {
    if (s >= 0.5) continue;
    const r = readout(d, cell, target, params);
    out.push({ dim: d, text: `${DIM_LABEL[d]}: here ${r.earth}; the target: ${r.target}.` });
  }
  return out.sort((a, b) => (cell.sims[a.dim] ?? 0) - (cell.sims[b.dim] ?? 0));
}

export function fieldTests(cell: CellResult) {
  return strengths(cell)
    .slice(0, 4)
    .map(({ dim }) => {
      const t = TEST[dim];
      return typeof t === "function" ? t(cell) : t;
    });
}

export { pctText };
