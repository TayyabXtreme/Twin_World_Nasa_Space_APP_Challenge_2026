"use client";

import { cellValues } from "./model";
import { earthDose, longestDaylight, ORBIT } from "./params";
import { siteWater, type KnownPlace } from "./places";
import terrain from "./target-terrain.generated.json";
import type { CellResult, DimId, ParamsHeader, Target } from "./types";

/**
 * Site vs target conditions for the Finder's full breakdown: the thirteen parameters the ranking uses, the Earth
 * place on one side and the Moon or Mars target on the other, each with the dataset behind it.
 *
 * Earth values: NASA POWER climatology (MERRA-2) and ISRIC SoilGrids are fetched live for the exact point; when a
 * lookup fails the gridded values the ranking uses are shown instead (scripts/build-finder-params.py, the same
 * datasets on the 0.25° grid). Slope, isolation and elevation come from our grids; radiation and daylight are
 * computed from elevation and latitude. Target values come from LRO/MGS elevation models
 * (target-terrain.generated.json), the targets' Diviner facts and published mission results cited per row.
 * Each row's match is the similarity the ranking itself used for this cell, so the bars add up to the score.
 */

export interface ConditionRow {
  id: string;
  parameter: string;
  units: string;
  site: string;
  target: string;
  /** The target value lies outside anything found on Earth. */
  unreachable?: boolean;
  /** Short note under the parameter name (why values cannot be compared, how a value was made). */
  note?: string;
  siteSource: string;
  targetSource: string;
  /** The ranking's similarity for this parameter at this cell, 0–1; absent when the target has no value. */
  match?: number;
  /** The target lies beyond Earth's range, so the match ranks how far this place goes toward it. */
  toward?: boolean;
}

/** A value that is really missing (as opposed to loading, "…"). Rows with one on either side are hidden. */
export const isMissing = (v: string) => /^(–|not measured|no NASA|no soil data|Not catalogued)/.test(v);

/* ------------------------------------------------------------------ Earth: live NASA POWER + SoilGrids */

export interface EarthClimate {
  tmean: number;
  tmax: number;
  tmin: number;
  /** mm per day */
  precip: number;
  rh: number;
  /** kPa */
  ps: number;
  aod: number;
}

const POWER_PARAMS = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,PS,AOD_55";
const climateCache = new Map<string, Promise<EarthClimate | null>>();
const sandCache = new Map<string, Promise<number | null>>();
const key = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

/** fetch() that tries again after 1.5 s and 4 s when NASA POWER is busy (429, 5xx) or the network drops. */
async function fetchRetry(url: string, tries = 3): Promise<Response | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      if (r.status < 429 || r.status === 501) return null;
    } catch {
      // network error: retry below
    }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, i === 0 ? 1500 : 4000));
  }
  return null;
}

/** NASA POWER monthly climatology for one point; ANN of T2M_MAX / T2M_MIN is the warmest / coldest month. */
export function fetchClimate(lat: number, lon: number): Promise<EarthClimate | null> {
  const k = key(lat, lon);
  let p = climateCache.get(k);
  if (!p) {
    const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=${POWER_PARAMS}&community=RE&latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&format=JSON`;
    p = fetchRetry(url)
      .then((r) => (r ? r.json() : null))
      .then((d) => {
        const v = d?.properties?.parameter as Record<string, Record<string, number>> | undefined;
        if (!v) return null;
        const ann = (name: string) => {
          const x = v[name]?.ANN;
          return x === undefined || x <= -998 ? NaN : x;
        };
        return {
          tmean: ann("T2M"),
          tmax: ann("T2M_MAX"),
          tmin: ann("T2M_MIN"),
          precip: ann("PRECTOTCORR"),
          rh: ann("RH2M"),
          ps: ann("PS"),
          aod: ann("AOD_55"),
        };
      })
      .catch(() => null);
    p.then((r) => r ?? climateCache.delete(k));
    climateCache.set(k, p);
  }
  return p;
}

/** Sand share (%) of the top 5 cm from SoilGrids; null over ice, rock and water, where it has no soil. */
export function fetchSand(lat: number, lon: number): Promise<number | null> {
  const k = key(lat, lon);
  let p = sandCache.get(k);
  if (!p) {
    const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon.toFixed(3)}&lat=${lat.toFixed(3)}&property=sand&depth=0-5cm&value=mean`;
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const layer = d?.properties?.layers?.[0];
        const mean = layer?.depths?.[0]?.values?.mean as number | null | undefined;
        const factor = (layer?.unit_measure?.d_factor as number | undefined) ?? 10;
        return mean == null ? null : mean / factor;
      })
      .catch(() => null);
    sandCache.set(k, p);
  }
  return p;
}

/* ------------------------------------------------------------------ targets */

const MARS_WATER: Record<string, [string, string]> = {
  "mars-jezero": ["Clays and carbonates", "MRO CRISM; Perseverance"],
  "mars-gale": ["Clays and sulfates", "MRO CRISM; Curiosity CheMin"],
  "mars-mawrth-vallis": ["Thick clay-rich layers", "Mars Express OMEGA; MRO CRISM"],
  "mars-utopia-viking2": ["Buried ground ice", "MRO SHARAD radar"],
  "mars-arcadia": ["Shallow ground ice", "MRO SHARAD; HiRISE fresh craters"],
  "mars-hellas": ["Buried glacier ice in nearby aprons", "MRO SHARAD radar"],
  "mars-phoenix": ["Ice, perchlorate, carbonate", "Phoenix lander (WCL, TEGA)"],
};

/** Mars grain size from thermal inertia (Presley & Christensen 1997 classes). */
const marsGrain = (ti: number | undefined) =>
  ti === undefined
    ? "–"
    : ti < 150
      ? `dust and silt (TI ${ti})`
      : ti <= 420
        ? `sand-sized (TI ${ti})`
        : `coarse or crusted (TI ${ti})`;

const fmt = (v: number, digits = 0) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).replace("-", "−")
    : "–";
const K2C = (k: number) => k - 273.15;

export interface ConditionInput {
  cell: CellResult;
  target: Target;
  known?: KnownPlace;
  /** earth-params.json: decodes the cell's gridded values. */
  params: ParamsHeader;
  /** Live NASA POWER values: undefined = loading, null = unavailable (the gridded values are shown instead). */
  climate: EarthClimate | null | undefined;
  /** Live SoilGrids sand: undefined = loading, null = no soil there or no answer. */
  sand: number | null | undefined;
}

export function conditionRows({ cell, target, known, params, climate, sand }: ConditionInput): ConditionRow[] {
  const moon = target.world === "moon";
  const fact = (re: RegExp) => target.facts.find((f) => re.test(f.label))?.v ?? undefined;
  const tt = (terrain as Record<string, { elev: number; slope: number | null; source: string }>)[target.id];
  const g = cellValues(params, cell.q);
  const loading = climate === undefined;
  const c = climate ?? null;
  const POWER = "NASA POWER climatology (MERRA-2)";
  const GRID = "NASA POWER climatology on the Finder's 0.25° grid (live lookup unavailable)";
  // The live point value when NASA POWER answered, the gridded climatology the ranking uses when it did not.
  const climateValue = (live: number | undefined, gridded: number, digits = 1) =>
    loading ? "…" : fmt(c ? (live ?? NaN) : gridded, digits);
  const climateSource = (what: string) => `${loading || c ? POWER : GRID}, ${what}`;

  const elev = g.elev;
  const daylightSite = longestDaylight(cell.lat, ORBIT.earth.obliquity, ORBIT.earth.day);
  const daylightTarget = longestDaylight(target.lat, ORBIT[target.world].obliquity, ORBIT[target.world].day);

  const tAvg = fact(/annual average temperature/i);
  const tMax = fact(/annual max temperature/i);
  const marius = target.id === "moon-marius-hills-pit";
  const roverTemps = target.id === "mars-gale" || target.id === "mars-jezero";
  const ti = moon ? undefined : fact(/thermal inertia/i);
  const marsPressure = tt ? 0.636 * Math.exp(-tt.elev / 11100) : NaN;
  const water = known ? siteWater(known.id) : null;
  const marsSand = target.params.sand?.v ?? null;
  const griddedSand = Number.isFinite(g.sand);

  const rows: Omit<ConditionRow, "match" | "toward" | "unreachable">[] = [
    {
      id: "tmean",
      parameter: "Mean temperature",
      units: "°C",
      site: climateValue(c?.tmean, g.tmean),
      target: moon ? (tAvg !== undefined ? fmt(K2C(tAvg)) : marius ? "117 noon / −178 night" : "–") : "≈ −63",
      siteSource: climateSource("2 m air"),
      targetSource: moon
        ? marius
          ? "LRO Diviner (equatorial noon / pre-dawn surface)"
          : "LRO Diviner polar resource product, annual mean surface"
        : "NASA Mars fact sheet: planet-wide mean (210 K)",
      note: !moon ? "Mars value is the planet-wide mean" : undefined,
    },
    {
      id: "trange",
      parameter: "Temperature range",
      units: "°C",
      site: loading ? "…" : fmt(c ? c.tmax - c.tmin : g.trange, 1),
      target: moon
        ? marius
          ? "295"
          : tAvg !== undefined && tMax !== undefined
            ? `≥ ${fmt(tMax - tAvg)}`
            : "–"
        : roverTemps
          ? "≈ 100"
          : "not measured",
      siteSource: climateSource("hottest minus coldest of the year"),
      targetSource: moon
        ? marius
          ? "LRO Diviner: 390 K at noon to 95 K before dawn"
          : "LRO Diviner: annual maximum minus annual mean (the full range is wider)"
        : roverTemps
          ? target.id === "mars-gale"
            ? "Curiosity REMS ground sensor: ≈ −90 to 0–20 °C"
            : "Perseverance MEDA ground sensor: ≈ −90 to 0–20 °C"
          : "No ground temperature record at this site",
    },
    {
      id: "radiation",
      parameter: "Radiation dose",
      units: "µSv/day",
      site: fmt(earthDose(elev), 2),
      target: moon ? "> 640" : "640",
      note: moon ? "No air or magnetic field: higher than Mars" : "No thick air or magnetic field",
      siteSource: "Estimate: UNSCEAR 2000 cosmic + terrestrial background, scaled by AW3D30 elevation",
      targetSource: moon
        ? "No NASA surface measurement; with no air or magnetic field the dose exceeds Mars's (LRO CRaTER, from orbit)"
        : "Curiosity RAD, Gale crater surface (Hassler et al. 2014, Science)",
    },
    {
      id: "slope",
      parameter: "Terrain slope",
      units: "° over ~28 km",
      site: fmt(g.slope, 2),
      target: tt?.slope != null ? fmt(tt.slope, 2) : "–",
      siteSource: "JAXA ALOS AW3D30 DSM, between neighbouring 0.25° cells",
      targetSource: tt
        ? `${moon ? "LRO LOLA" : "MGS MOLA"}, ~28 km box means`
        : "No elevation model at this site in our data",
    },
    {
      id: "sand",
      parameter: "Soil composition",
      units: "% sand",
      site:
        sand === undefined ? "…" : sand !== null ? fmt(sand, 0) : griddedSand ? fmt(g.sand, 0) : "no soil data",
      target: moon ? "≈ 50–60" : marsSand !== null ? `≈ ${marsSand}, ${marsGrain(ti)}` : marsGrain(ti),
      note: moon ? undefined : "Mars sand share from grain size (thermal inertia)",
      siteSource:
        sand === null && griddedSand ? "ISRIC SoilGrids 2.0, top 5 cm, 0.25° average" : "ISRIC SoilGrids 2.0, top 5 cm",
      targetSource: moon
        ? "Apollo samples: median grain ≈ 70 µm (Lunar Sourcebook, Carrier et al. 1991)"
        : "MGS TES night thermal inertia, classes after Presley & Christensen 1997 (sand-sized ≈ 85 %, dust ≈ 20 %)",
    },
    {
      id: "pressure",
      parameter: "Atmospheric pressure",
      units: "kPa",
      site: climateValue(c?.ps, g.ps),
      target: moon ? "0 (vacuum)" : Number.isFinite(marsPressure) ? fmt(marsPressure, 2) : "≈ 0.6",
      siteSource: climateSource("surface pressure"),
      targetSource: moon
        ? "No atmosphere"
        : "0.636 kPa at the mean surface (NASA Mars fact sheet), 11.1 km scale height, MOLA height",
    },
    {
      id: "daylight",
      parameter: "Daylight",
      units: "h, longest day",
      site: fmt(daylightSite, 1),
      target: fmt(daylightTarget, daylightTarget >= 100 ? 0 : 1),
      note: moon ? "One lunar day lasts 708.7 h" : undefined,
      siteSource: "Computed from latitude and Earth's 23.44° tilt (flat horizon)",
      targetSource: moon
        ? "Computed: Moon's 1.54° tilt, 708.7 h solar day (flat horizon; crater rims shade or extend it)"
        : "Computed: Mars's 25.19° tilt, 24.66 h sol (flat horizon)",
    },
    {
      id: "precip",
      parameter: "Precipitation",
      units: "mm/yr",
      site: loading ? "…" : fmt(c ? c.precip * 365.25 : g.precip, 0),
      target: moon ? "0 (no air)" : "0 (no rain)",
      siteSource: climateSource("corrected precipitation"),
      targetSource: moon ? "No atmosphere" : "Mars air is too thin and cold for liquid rain",
    },
    {
      id: "rh",
      parameter: "Relative humidity",
      units: "%",
      site: climateValue(c?.rh, g.rh, 0),
      target: moon ? "0 (no air)" : "≈ 0 by day",
      siteSource: climateSource("2 m air"),
      targetSource: moon ? "No atmosphere" : "Curiosity REMS-H: a few % by day, near frost point at night",
    },
    {
      id: "aod",
      parameter: "Dust activity",
      units: "AOD",
      site: climateValue(c?.aod, g.aod, 2),
      target: moon ? "0 (no air)" : "0.3–1",
      note: moon ? undefined : "Global dust storms raise Mars's value far higher",
      siteSource: climateSource("aerosol optical depth at 550 nm"),
      targetSource: moon
        ? "No atmosphere to hold dust"
        : "Spirit and Opportunity Pancam sky record (Lemmon et al. 2015)",
    },
    {
      id: "isolation",
      parameter: "Isolation",
      units: "km to nearest town",
      site: fmt(g.isolation, 0),
      target: moon ? "384,400" : "≈ 225 million",
      note: moon ? "Distance from Earth" : "Average distance from Earth",
      siteSource: "Natural Earth populated places, incl. research stations",
      targetSource: moon
        ? "NASA Moon fact sheet: mean Earth–Moon distance"
        : "NASA Mars fact sheet: mean Earth–Mars distance",
    },
    {
      id: "elev",
      parameter: "Elevation",
      units: "m",
      site: fmt(elev, 0),
      target: tt ? fmt(tt.elev, 0) : "–",
      note: "Each world has its own zero level, so heights are matched by rank within each world",
      siteSource: "JAXA ALOS AW3D30 DSM (0.2°), height above sea level",
      targetSource: tt?.source ?? "No elevation model at this site in our data",
    },
    {
      id: "water",
      parameter: "Aqueous geochemistry",
      units: "water-formed minerals or ice",
      site: water ?? "Not catalogued",
      target: moon ? (marius ? "None (dry basalt)" : "Water ice in cold traps") : (MARS_WATER[target.id]?.[0] ?? "–"),
      siteSource: known ? "Site geology notes (lib/data/sites.ts)" : "Only known analogue sites are catalogued",
      targetSource: moon
        ? marius
          ? "Apollo and LRO: lunar basalt formed without water"
          : "LCROSS impact (2009) and LRO LAMP, Diviner"
        : (MARS_WATER[target.id]?.[1] ?? "–"),
    },
  ];
  return rows.map((r) => {
    const spec = target.params[r.id as DimId];
    return { ...r, match: cell.sims[r.id as DimId], toward: spec?.mode === "toward", unreachable: spec?.unreachable };
  });
}
