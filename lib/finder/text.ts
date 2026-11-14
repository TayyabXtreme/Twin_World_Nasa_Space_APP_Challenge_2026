import type { World } from "@/lib/worlds";
import { EARTH_OBLIQUITY, maxSun, valueOf } from "./model";
import { type CellResult, DIM_IDS, type DimId, type GridHeader, type Target, type Weights } from "./types";

/** Words for the Analog Finder: dimension labels, readouts, strengths, limits and field tests. */

export const DIM_LABEL: Record<DimId, string> = {
  cold: "Cold",
  swing: "Day–night swing",
  bare: "Bare & lifeless",
  inertia: "Loose vs rocky",
  ice: "Frozen ground",
  sun: "Sun angle",
  relief: "Terrain relief",
};

export const DIM_HINT: Record<DimId, string> = {
  cold: "Rank of mean surface temperature within each world (role match)",
  swing: "Rank of the day–night swing; Earth ranked among bare, snow-free land",
  bare: "MODIS NDVI against the target's NDVI 0 (absolute)",
  inertia: "TES thermal inertia (Mars) vs MODIS apparent thermal inertia (Earth), by rank",
  ice: "Hydrogen / cold traps vs Earth's freezing index, by rank",
  sun: "Highest noon Sun of the year, degrees (absolute)",
  relief: "Std of elevation over ~66 km, metres (absolute)",
};

export const DEFAULT_WEIGHTS: Record<Exclude<World, "earth">, Weights> = {
  moon: { cold: 1, ice: 1, bare: 0.8, sun: 0.6, relief: 0.5, swing: 0.4, inertia: 0.4 },
  mars: { bare: 1, inertia: 0.8, ice: 0.8, cold: 0.6, sun: 0.5, relief: 0.5, swing: 0.4 },
};

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
    { title: "Radiation", text: "About 0.67 mSv per day at Gale (Curiosity RAD, Hassler et al. 2014), roughly 100× sea level on Earth." },
    { title: "Chemistry", text: "Perchlorate-rich, oxidising soils and no ozone layer: UV sterilises the top millimetres. No Earth desert is fully lifeless." },
  ],
};

const c = (k: number) => k - 273.15;
const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "–");
const pctText = (p: number) => {
  const v = p * 100;
  if (v < 0.1) return "<0.1";
  if (v > 99.9) return ">99.9";
  return v < 1 || v > 99 ? v.toFixed(1) : v.toFixed(0);
};

export interface DimReadout {
  earth: string;
  target: string;
}

const WORLD_NAME: Record<Exclude<World, "earth">, string> = { moon: "the Moon", mars: "Mars" };

/** Earth value and target value of one dimension, in words with units. */
export function readout(d: DimId, cell: CellResult, target: Target, header: GridHeader): DimReadout {
  const spec = target.dims[d];
  const w = WORLD_NAME[target.world];
  const world = spec?.worldPct ?? 0.5;
  switch (d) {
    case "cold": {
      const t = valueOf(header, "tmean", cell.q.tmean);
      const p = cell.pct.tmean;
      return {
        earth: Number.isFinite(t) ? `${fmt(c(t))} °C mean surface, ${(p ?? 0.5) < 0.5 ? `colder than ${pctText(1 - (p ?? 0.5))}` : `warmer than ${pctText(p ?? 0.5)}`} % of land` : "No temperature data",
        target: world < 0.5 ? `colder than ${pctText(1 - world)} % of ${w}` : `warmer than ${pctText(world)} % of ${w}`,
      };
    }
    case "swing": {
      const s = valueOf(header, "swing", cell.q.swing);
      const p = cell.pct.swing;
      return {
        earth: Number.isFinite(s) ? `${fmt(s)} K day–night, larger than ${pctText(p ?? 0)} % of bare land` : "No data",
        target: `larger than ${pctText(world)} % of ${w}'s swings`,
      };
    }
    case "bare": {
      const v = valueOf(header, "ndvi", cell.q.ndvi);
      return { earth: Number.isFinite(v) ? `NDVI ${fmt(v, 2)} in the greener month` : "No vegetation data", target: "NDVI 0, no plants" };
    }
    case "inertia": {
      const v = valueOf(header, "ati", cell.q.ati);
      const p = cell.pct.ati;
      const val = spec?.value;
      return {
        earth: Number.isFinite(v) ? `ATI ${fmt(v * 1000, 0)}×10⁻³ K⁻¹, higher than ${pctText(p ?? 0)} % of bare land` : "No albedo / LST data",
        target: `${val ? `${val.v} ${val.units}, ` : ""}higher than ${pctText(world)} % of ${w}`,
      };
    }
    case "ice": {
      const v = valueOf(header, "freeze", cell.q.freeze);
      return {
        earth: Number.isFinite(v) ? (v < 0.3 ? "Above freezing in all sampled months" : `Freezing index ${fmt(v)} K below 0 °C (mean of 4 months)`) : "No data",
        target: `more ice-favourable than ${pctText(world)} % of ${w}`,
      };
    }
    case "sun": {
      const e = maxSun(cell.lat, EARTH_OBLIQUITY);
      return { earth: `noon Sun up to ${fmt(e)}° high`, target: `up to ${fmt(spec?.earthTarget ?? 0, 1)}° high` };
    }
    case "relief": {
      const v = valueOf(header, "relief", cell.q.relief);
      return {
        earth: Number.isFinite(v) ? `${fmt(v)} m relief over ~66 km` : "No elevation data (AW3D30 ends at 84°S): counted as half a match",
        target: `${fmt(spec?.earthTarget ?? NaN)} m relief over ~66 km`,
      };
    }
  }
}

/** One row of the per-parameter breakdown: the Earth value, the target value, how close counts, weight and source. */
export interface ParamRow {
  dim: DimId;
  parameter: string;
  units: string;
  /** Earth value at the selected cell, in physical units. */
  site: string;
  /** Earth rank (0–100) for role-matched parameters. */
  siteRank?: number;
  /** Target value in its own physical units, when the archive gives one. */
  target: string;
  /** Target rank (0–100) within its own world, for role-matched parameters. */
  targetRank?: number;
  /** How far from the target a value can be and still score well (the width of the similarity curve). */
  tolerance: string;
  weight: number;
  source: "measured" | "derived" | "computed";
  earthSource: string;
  targetSource: string;
  similarity: number;
  mode: "role" | "absolute";
  /** Why the physical values cannot match, when that is the case (scored by rank instead). */
  caveat?: string;
}

const K2C = (k: number) => k - 273.15;
const rank = (p: number | undefined) => (p === undefined ? undefined : Math.round(p * 100));
const ROLE_TOL = "±12 rank points";

/**
 * How directly each parameter is measured on both worlds (1 = measured on both; lower = a proxy on one side).
 * Mars mean temperature is a latitude energy-balance rank; swing and thermal inertia use an index or apparent
 * thermal inertia; Mars "ice" is hydrogen, which can sit in hydrated minerals.
 */
export const DATA_QUALITY: Record<"moon" | "mars", Record<DimId, number>> = {
  moon: { cold: 1, swing: 0.75, bare: 1, inertia: 0.75, ice: 0.9, sun: 1, relief: 1 },
  mars: { cold: 0.6, swing: 0.75, bare: 1, inertia: 0.75, ice: 0.8, sun: 1, relief: 1 },
};

const EARTH_KEY: Partial<Record<DimId, keyof CellResult["q"]>> = { cold: "tmean", swing: "swing", bare: "ndvi", inertia: "ati", ice: "freeze", relief: "relief" };

/**
 * Data confidence 0–100: the weighted share of the score that rests on direct measurements, with Earth data present.
 * `flags` is the cell's data-quality byte from earth-detail.bin (bits 0–2 months with LST out of 4, bit 3 polar-night
 * fill, bit 4 no NDVI, bit 5 no albedo); without it only missing core values count against the site.
 */
export function confidence(cell: CellResult, target: Target, weights: Weights, flags?: number) {
  const f = flags === undefined || !Number.isFinite(flags) ? null : flags;
  const months = f === null ? 4 : f & 7;
  const lst = months / 4;
  const polarFill = f !== null && (f & 8) !== 0;
  const noNdvi = f !== null && (f & 16) !== 0;
  const noAlbedo = f !== null && (f & 32) !== 0;
  const earthQuality: Partial<Record<DimId, number>> = {
    cold: lst,
    swing: lst * (polarFill ? 0.5 : 1),
    ice: lst,
    bare: noNdvi ? 0.6 : 1,
    inertia: lst * (polarFill ? 0.5 : 1) * (noAlbedo ? 0.5 : 1),
  };
  let num = 0;
  let den = 0;
  for (const d of DIM_IDS) {
    if (cell.sims[d] === undefined || !target.dims[d]) continue;
    const w = weights[d] ?? 0;
    const key = EARTH_KEY[d];
    const earthOk = !key || cell.q[key] > 0;
    num += w * (earthOk ? DATA_QUALITY[target.world][d] * (earthQuality[d] ?? 1) : 0);
    den += w;
  }
  return den > 0 ? Math.round((100 * num) / den) : 0;
}

/**
 * Measured surface temperatures of a target, where our data have them: Diviner annual maximum / average at the lunar
 * south-pole targets, Diviner noon / pre-dawn near the equator, and the rover-measured ground range at the two Mars
 * landing sites with weather stations. Other Mars targets have no measured value in our data.
 */
function targetTemps(target: Target): { text: string; source: string } | null {
  const max = target.facts.find((f) => /annual max temperature/i.test(f.label))?.v;
  const avg = target.facts.find((f) => /annual average temperature/i.test(f.label))?.v;
  if (max != null && avg != null) return { text: `${K2C(max).toFixed(0)} max / ${K2C(avg).toFixed(0)} avg`, source: "LRO Diviner PRP (annual)" };
  if (target.id === "moon-marius-hills-pit") return { text: "≈ 117 / −178", source: "LRO Diviner (noon / pre-dawn)" };
  if (target.id === "mars-gale") return { text: "0 to 20 / ≈ −90", source: "Curiosity REMS ground sensor" };
  if (target.id === "mars-jezero") return { text: "0 to 20 / ≈ −90", source: "Perseverance MEDA ground sensor" };
  return null;
}

/** Per-parameter table: real Earth and target values, tolerance, weight, source and similarity for every scored dimension. */
export function parameterRows(
  cell: CellResult,
  target: Target,
  header: GridHeader,
  weights: Weights,
  detail?: Record<string, number> | null,
): ParamRow[] {
  const fact = (re: RegExp) => target.facts.find((f) => re.test(f.label));
  const moon = target.world === "moon";
  const rows: ParamRow[] = [];
  for (const d of DIM_IDS) {
    const sim = cell.sims[d];
    const spec = target.dims[d];
    if (sim === undefined || !spec) continue;
    const base = { dim: d, weight: weights[d] ?? 0, similarity: sim, mode: spec.mode, targetRank: spec.worldPct === undefined ? undefined : rank(spec.worldPct) };
    switch (d) {
      case "cold": {
        const t = valueOf(header, "tmean", cell.q.tmean);
        const day = detail?.tday;
        const night = detail?.tnight;
        const hasDN = day !== undefined && night !== undefined && Number.isFinite(day) && Number.isFinite(night);
        const tt = targetTemps(target);
        rows.push({
          ...base,
          parameter: "Surface temperature",
          units: moon ? "°C · Earth day / night" : "°C, day / night",
          site: hasDN ? `${K2C(day).toFixed(0)} / ${K2C(night).toFixed(0)}` : Number.isFinite(t) ? `${K2C(t).toFixed(0)} mean` : "–",
          siteRank: rank(cell.pct.tmean),
          target: tt?.text ?? "not measured",
          tolerance: ROLE_TOL,
          source: "measured",
          earthSource: hasDN ? "MODIS MOD11C3 LST (10:30 / 22:30)" : "MODIS MOD11C3 LST",
          targetSource: tt?.source ?? "No Mars surface-temperature map in our data",
          caveat: moon
            ? "No place on Earth gets this cold, so the mean is matched by rank: coldest of each world"
            : "Matched by rank of mean temperature (Mars rank from a latitude energy balance)",
        });
        break;
      }
      case "swing": {
        const s = valueOf(header, "swing", cell.q.swing);
        rows.push({
          ...base,
          parameter: "Day–night swing",
          units: "K",
          site: Number.isFinite(s) ? s.toFixed(1) : "–",
          siteRank: rank(cell.pct.swing),
          target: spec.value ? `${spec.value.v} idx` : "–",
          tolerance: ROLE_TOL,
          source: "derived",
          earthSource: "MODIS MOD11C3 day − night",
          targetSource: spec.value?.source ?? (moon ? "LRO Diviner" : "MGS TES"),
          caveat: spec.value ? "Target is an index (cos lat ÷ thermal inertia), so matched by rank" : "Target rank from Diviner; matched by rank within each world",
        });
        break;
      }
      case "bare": {
        const v = valueOf(header, "ndvi", cell.q.ndvi);
        rows.push({
          ...base,
          parameter: "Vegetation (NDVI)",
          units: "index",
          site: Number.isFinite(v) ? v.toFixed(2) : "–",
          target: "0.00",
          tolerance: "≤ 0.03, then σ 0.10",
          source: "measured",
          earthSource: "MODIS MOD13C2",
          targetSource: spec.value?.source ?? "No vegetation",
        });
        break;
      }
      case "inertia": {
        const v = valueOf(header, "ati", cell.q.ati);
        rows.push({
          ...base,
          parameter: "Thermal inertia (loose vs rock)",
          units: "Earth ATI ×10⁻³ · target tiu",
          site: Number.isFinite(v) ? (v * 1000).toFixed(0) : "–",
          siteRank: rank(cell.pct.ati),
          target: spec.value ? String(spec.value.v) : "–",
          tolerance: ROLE_TOL,
          source: "derived",
          earthSource: "MODIS MCD43C3 albedo + MOD11C3",
          targetSource: spec.value?.source ?? (moon ? "LRO Diviner" : "MGS TES"),
          caveat: "Different units on each world (apparent vs true thermal inertia), so matched by rank",
        });
        break;
      }
      case "ice": {
        const v = valueOf(header, "freeze", cell.q.freeze);
        const iceFact = fact(/ice stable/i);
        rows.push({
          ...base,
          parameter: moon ? "Frozen ground · ice stability" : "Frozen ground · hydrogen",
          units: moon ? "Earth K below 0 °C · target % ice-stable" : "Earth K below 0 °C · target counts/s",
          site: Number.isFinite(v) ? v.toFixed(1) : "–",
          siteRank: rank(cell.pct.freeze),
          target: spec.value ? String(spec.value.v) : iceFact?.v != null ? `${iceFact.v}` : "–",
          tolerance: ROLE_TOL,
          source: "measured",
          earthSource: "MODIS MOD11C3 (freezing index)",
          targetSource: spec.value?.source ?? iceFact?.source ?? (moon ? "LRO Diviner PRP" : "Mars Odyssey NS"),
          caveat: moon ? "Earth permafrost vs lunar cold traps: matched by rank" : "Fewer neutrons = more hydrogen; matched by rank",
        });
        break;
      }
      case "sun": {
        rows.push({
          ...base,
          parameter: "Max noon Sun height",
          units: "°",
          site: maxSun(cell.lat, EARTH_OBLIQUITY).toFixed(1),
          target: (spec.earthTarget ?? 0).toFixed(1),
          tolerance: "σ 10°",
          source: "computed",
          earthSource: "Latitude + 23.44° tilt",
          targetSource: spec.value?.source ?? "Latitude + axial tilt",
        });
        break;
      }
      case "relief": {
        const v = valueOf(header, "relief", cell.q.relief);
        rows.push({
          ...base,
          parameter: "Terrain relief (~66 km)",
          units: "m",
          site: Number.isFinite(v) ? Math.round(v).toString() : "no data",
          target: spec.earthTarget != null ? Math.round(spec.earthTarget).toString() : "–",
          tolerance: "× or ÷ 2.2",
          source: "measured",
          earthSource: "JAXA AW3D30 DEM",
          targetSource: spec.value?.source ?? (moon ? "LRO LOLA" : "MGS MOLA"),
          caveat: Number.isFinite(v) ? undefined : "AW3D30 ends at 84°S: counted as half a match",
        });
        break;
      }
    }
  }
  return rows;
}

const STRENGTH: Record<DimId, string> = {
  cold: "Its temperature plays the same role on Earth as the target's does on its world",
  swing: "A similar day–night thermal cycle, ranked within each world",
  bare: "Barren ground with no plant signal",
  inertia: "A similar mix of loose fines and rock (thermal inertia rank)",
  ice: "Frozen ground in the same role as the target's ice",
  sun: "A similar Sun height and seasonal light",
  relief: "Similar relief over tens of kilometres",
};

const TEST: Record<DimId, string | ((cell: CellResult) => string)> = {
  cold: "Cold-soak habitats, batteries, seals and lubricants; thermal-control tests at the low end of Earth's range.",
  swing: "Thermal cycling of structures, solar panels and electronics.",
  bare: "Rover traverses, sample caching and the limits of life detection on barren ground.",
  inertia: (cell) =>
    (cell.pct.ati ?? 0.5) < 0.5 ? "Wheel sinkage, trafficability and dust handling on loose fine-grained ground." : "Drilling, coring and anchoring in consolidated rock and duricrust.",
  ice: "Radar and neutron prospecting for buried ice; drilling and sampling frozen ground.",
  sun: "Navigation cameras, shadows and solar power under a similar Sun path.",
  relief: "Landing-hazard detection, slope traverses and line-of-sight communications.",
};

export function strengths(cell: CellResult) {
  return (Object.entries(cell.sims) as [DimId, number][])
    .filter(([, s]) => s >= 0.75)
    .sort((a, b) => b[1] - a[1])
    .map(([d]) => ({ dim: d, text: STRENGTH[d] }));
}

export function weaknesses(cell: CellResult, target: Target, header: GridHeader) {
  const out: { dim: DimId; text: string }[] = [];
  for (const [d, s] of Object.entries(cell.sims) as [DimId, number][]) {
    if (s >= 0.5) continue;
    const r = readout(d, cell, target, header);
    out.push({ dim: d, text: `${DIM_LABEL[d]}: here ${r.earth.charAt(0).toLowerCase()}${r.earth.slice(1)}; the target is ${r.target}.` });
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
