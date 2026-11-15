import type { World } from "@/lib/worlds";
import generated from "./params.generated.json";
import type { ChannelKey, DimId, ParamSpec, TargetsDoc, Weights } from "./types";

/**
 * The thirteen Finder parameters: names, closeness curves and default weights. Free of DOM and React so the scoring
 * worker can import it. Target values and curves come from scripts/build-finder-params.py (params.generated.json),
 * which ml/twinworlds_ml.py reads too, so the browser, the breakdown table and the model all use the same numbers.
 */

export interface Curve {
  /** Gaussian width: in the parameter's units, or in decades when `log` is set (log10(value + log)). */
  sigma: number;
  log?: number;
}

export const CURVES = generated.curves as Record<DimId, Curve>;
const TARGET_PARAMS = generated.targets as unknown as Record<string, Partial<Record<DimId, ParamSpec>>>;

/** Attach each target's parameter specs (the JSON files are built separately, so targets.json does not carry them). */
export function withParams(doc: TargetsDoc): TargetsDoc {
  return { ...doc, targets: doc.targets.map((t) => ({ ...t, params: TARGET_PARAMS[t.id] ?? {} })) };
}

export const DIM_LABEL: Record<DimId, string> = {
  tmean: "Mean temperature",
  trange: "Temperature range",
  radiation: "Radiation dose",
  slope: "Terrain slope",
  sand: "Soil composition",
  pressure: "Atmospheric pressure",
  daylight: "Daylight",
  precip: "Precipitation",
  rh: "Relative humidity",
  aod: "Dust activity",
  isolation: "Isolation",
  elev: "Elevation",
  water: "Aqueous geochemistry",
};

/** Short names for narrow places (bars, list rows). */
export const DIM_SHORT: Record<DimId, string> = {
  tmean: "Temperature",
  trange: "Temp. range",
  radiation: "Radiation",
  slope: "Slope",
  sand: "Soil (sand)",
  pressure: "Air pressure",
  daylight: "Daylight",
  precip: "Precipitation",
  rh: "Humidity",
  aod: "Dust",
  isolation: "Isolation",
  elev: "Elevation",
  water: "Water minerals",
};

export const DIM_UNITS: Record<DimId, string> = {
  tmean: "°C",
  trange: "°C",
  radiation: "µSv/day",
  slope: "°",
  sand: "% sand",
  pressure: "kPa",
  daylight: "h",
  precip: "mm/yr",
  rh: "%",
  aod: "AOD",
  isolation: "km",
  elev: "m",
  water: "",
};

/** One line on what each parameter measures on Earth. */
export const DIM_HINT: Record<DimId, string> = {
  tmean: "Annual mean air temperature, NASA POWER (MERRA-2)",
  trange: "Warmest minus coldest of the year, NASA POWER",
  radiation: "Natural background dose, estimated from elevation (UNSCEAR 2000)",
  slope: "Regional slope over ~28 km, JAXA AW3D30",
  sand: "Sand share of the top 5 cm, ISRIC SoilGrids",
  pressure: "Surface air pressure, NASA POWER",
  daylight: "Hours of daylight on the longest day, from latitude",
  precip: "Annual precipitation, NASA POWER",
  rh: "Annual mean relative humidity at 2 m, NASA POWER",
  aod: "Aerosol optical depth at 550 nm, NASA POWER (CERES)",
  isolation: "Distance to the nearest town or research station, Natural Earth",
  elev: "Height ranked within each world (each has its own zero level)",
  water: "Water-formed minerals or ice at catalogued analogue sites",
};

/**
 * Hand-set weights, per world. Moon: extreme cold, ice and the airless sky first. Mars: dryness (rain, humidity),
 * water-formed minerals and cold first.
 */
export const DEFAULT_WEIGHTS: Record<Exclude<World, "earth">, Weights> = {
  moon: {
    tmean: 1,
    water: 1,
    radiation: 0.7,
    trange: 0.6,
    pressure: 0.6,
    daylight: 0.6,
    precip: 0.5,
    sand: 0.5,
    slope: 0.5,
    rh: 0.4,
    isolation: 0.4,
    aod: 0.3,
    elev: 0.3,
  },
  mars: {
    precip: 1,
    water: 0.9,
    rh: 0.8,
    tmean: 0.7,
    trange: 0.6,
    sand: 0.6,
    aod: 0.5,
    pressure: 0.5,
    slope: 0.5,
    radiation: 0.4,
    daylight: 0.4,
    isolation: 0.4,
    elev: 0.3,
  },
};

/** The Earth channel behind each parameter: a stored byte, the grid row (daylight) or the catalogued sites (water). */
export const SOURCE: Record<DimId, ChannelKey | "row" | "cell"> = {
  tmean: "tmean",
  trange: "trange",
  radiation: "elev",
  slope: "slope",
  sand: "sand",
  pressure: "ps",
  daylight: "row",
  precip: "precip",
  rh: "rh",
  aod: "aod",
  isolation: "isolation",
  elev: "elev",
  water: "cell",
};

/* ------------------------------------------------------------------ physics shared with the breakdown table */

/**
 * Natural background on Earth, µSv per day: cosmic rays (UNSCEAR 2000: 31 nSv/h ionising + 5.5 nSv/h neutrons at
 * sea level, roughly doubling every 1.5 km of altitude) plus the world-average outdoor terrestrial gamma dose
 * (59 nGy/h × 0.7 Sv/Gy). Radon and local soil radioactivity are not included.
 */
export function earthDose(elevM: number) {
  const z = Math.max(0, Number.isFinite(elevM) ? elevM : 0) / 1000;
  const cosmic = 36.5 * 2 ** (z / 1.5);
  return ((cosmic + 41) * 24) / 1000;
}

/**
 * Daylight on the longest day of the year (local summer solstice, either hemisphere), flat horizon: the fraction
 * of the solar day the Sun is up × the day's length.
 */
export function longestDaylight(lat: number, obliquityDeg: number, solarDayH: number) {
  const x = -Math.tan((Math.abs(lat) * Math.PI) / 180) * Math.tan((obliquityDeg * Math.PI) / 180);
  if (x <= -1) return solarDayH;
  if (x >= 1) return 0;
  return (Math.acos(x) / Math.PI) * solarDayH;
}

export const ORBIT: Record<World, { obliquity: number; day: number }> = {
  earth: { obliquity: 23.44, day: 24 },
  moon: { obliquity: 1.54, day: 708.7 },
  mars: { obliquity: 25.19, day: 24.66 },
};

/* ------------------------------------------------------------------ similarity */

const tf = (c: Curve, x: number) => (c.log === undefined ? x : Math.log10(Math.max(0, x) + c.log));

/**
 * Similarity 0..1 of one Earth value to the target (lib/finder/model.ts builds its lookup tables from this):
 *   near    exp(−½ (Δ / σ)²), Δ on the curve's scale; with `min`, any value above the bound scores 1
 *   toward  the Earth value's area percentile, flipped when the target lies below Earth's range
 *   rank    exp(−½ ((p_earth − p_target) / σ)²)
 * `pct` is the Earth value's area-weighted percentile over Earth's land.
 */
export function similarity(d: DimId, spec: ParamSpec, value: number, pct: number) {
  const c = CURVES[d];
  if (spec.mode === "toward") return (spec.dir ?? 1) > 0 ? pct : 1 - pct;
  if (spec.mode === "rank") return Math.exp(-0.5 * ((pct - (spec.pct ?? 0.5)) / c.sigma) ** 2);
  if (spec.v === null || !Number.isFinite(value)) return 0.5;
  const delta = tf(c, value) - tf(c, spec.v);
  if (spec.min && delta >= 0) return 1;
  return Math.exp(-0.5 * (delta / c.sigma) ** 2);
}

/** Similarity of an Earth cell where nothing is known: neither for nor against the place. */
export const UNKNOWN = 0.5;
