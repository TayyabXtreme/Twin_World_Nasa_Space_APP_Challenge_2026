"use client";

import { siteById } from "@/lib/data/sites";
import type { KnownPlace } from "./places";
import terrain from "./target-terrain.generated.json";
import type { CellResult, Target } from "./types";

/**
 * Site vs target conditions for the Finder's full breakdown: thirteen physical parameters, the Earth place on one
 * side and the Moon or Mars target on the other, each with the dataset behind it.
 *
 * Earth values come from three places:
 *  - NASA POWER climatology (MERRA-2, 2001–2025), fetched live for the selected cell: air temperature, range,
 *    precipitation, humidity, surface pressure and aerosol optical depth.
 *  - ISRIC SoilGrids 2.0, fetched live: sand content of the top 5 cm.
 *  - Our own grids (scripts/build-finder.py, build-finder-conditions.py): AW3D30 elevation and slope, distance to
 *    the nearest settlement. Radiation and daylight are computed from elevation and latitude.
 * Target values come from LRO/MGS elevation models (target-terrain.generated.json), the targets' Diviner facts,
 * and published mission results cited per row.
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
  /** Numeric site and target values behind the match (absent when a side is text only or not comparable). */
  sv?: number;
  tv?: number;
  /** How close the site is to the target, 0–1 (0 when unreachable); absent when it cannot be compared. */
  match?: number;
}

/** A value that is really missing (as opposed to loading, "…"). Rows with one on either side are hidden. */
export const isMissing = (v: string) => /^(–|not measured|no NASA|no soil data|Not catalogued)/.test(v);

/**
 * Closeness curves: a Gaussian on the difference, with sigma in the row's units (or in decades for log rows, where
 * the values span orders of magnitude). A difference of one sigma scores 61 %, two sigma 14 %.
 */
const MATCH: Record<string, { sigma: number; log?: number }> = {
  tmean: { sigma: 15 },
  trange: { sigma: 20 },
  radiation: { sigma: 0.3, log: 0.1 },
  slope: { sigma: 1.5 },
  sand: { sigma: 20 },
  pressure: { sigma: 0.3, log: 0.001 },
  daylight: { sigma: 3 },
  precip: { sigma: 60 },
  rh: { sigma: 20 },
  aod: { sigma: 0.25 },
  isolation: { sigma: 0.5, log: 1 },
};

function withMatch(r: ConditionRow): ConditionRow {
  if (r.id === "water" || r.match !== undefined) return r;
  const spec = MATCH[r.id];
  if (!spec || r.sv === undefined || r.tv === undefined || !Number.isFinite(r.sv) || !Number.isFinite(r.tv)) return r;
  if (r.unreachable) return { ...r, match: 0 };
  const d =
    spec.log === undefined
      ? r.sv - r.tv
      : Math.log10(Math.max(0, r.sv) + spec.log) - Math.log10(Math.max(0, r.tv) + spec.log);
  return { ...r, match: Math.exp(-0.5 * (d / spec.sigma) ** 2) };
}

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

/* ------------------------------------------------------------------ Earth: our per-cell grids */

interface SiteChannel {
  key: "slope" | "isolation";
  log: boolean;
  offset: number;
  scale: number;
  byteOffset: number;
  source: string;
}

export interface SiteGrid {
  channels: SiteChannel[];
  bytes: Uint8Array;
}

let sitePromise: Promise<SiteGrid> | null = null;
/** Slope and isolation for every land cell (scripts/build-finder-conditions.py), fetched once. */
export function loadSiteGrid() {
  sitePromise ??= Promise.all([
    fetch("/data/finder/earth-site.json").then((r) => r.json() as Promise<{ channels: SiteChannel[] }>),
    fetch("/data/finder/earth-site.bin").then((r) => r.arrayBuffer()),
  ]).then(([meta, buf]) => ({ channels: meta.channels, bytes: new Uint8Array(buf) }));
  sitePromise.catch(() => (sitePromise = null));
  return sitePromise;
}

function siteValue(grid: SiteGrid | null, k: SiteChannel["key"], cell: number) {
  const ch = grid?.channels.find((c) => c.key === k);
  if (!grid || !ch) return NaN;
  const q = grid.bytes[ch.byteOffset + cell];
  if (!q) return NaN;
  const v = ch.offset + (q - 1) * ch.scale;
  return ch.log ? 10 ** v - 1 : v;
}

/* ------------------------------------------------------------------ physics */

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

const ORBIT = {
  earth: { obliquity: 23.44, day: 24 },
  moon: { obliquity: 1.54, day: 708.7 },
  mars: { obliquity: 25.19, day: 24.66 },
};

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

const WATER_WORDS =
  /salt|evaporit|clay|lake|hydrotherm|sulfat|carbonat|nitrate|ice|permafrost|sinter|spring|gypsum|brine|perchlorat/i;

/** Water-formed minerals or ice at a catalogued Earth site, from its geology notes. */
function earthWater(known: KnownPlace | undefined) {
  if (!known) return null;
  const id = "siteId" in known ? String((known as KnownPlace & { siteId: string }).siteId) : known.id;
  const geo = siteById(id)?.geology?.filter((g) => WATER_WORDS.test(g)) ?? [];
  return geo.length ? geo.slice(0, 2).join("; ") : "None recorded";
}

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
    ? v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })
    : "–";
const K2C = (k: number) => k - 273.15;

export interface ConditionInput {
  cell: CellResult;
  target: Target;
  known?: KnownPlace;
  /** earth-detail.bin values of the cell (AW3D30 elevation in `elev`). */
  detail: Record<string, number> | null;
  site: SiteGrid | null;
  /** undefined = loading, null = unavailable */
  climate: EarthClimate | null | undefined;
  sand: number | null | undefined;
}

export function conditionRows({ cell, target, known, detail, site, climate, sand }: ConditionInput): ConditionRow[] {
  const moon = target.world === "moon";
  const fact = (re: RegExp) => target.facts.find((f) => re.test(f.label))?.v ?? undefined;
  const tt = (terrain as Record<string, { elev: number; slope: number | null; source: string }>)[target.id];
  const loading = climate === undefined;
  const c = climate ?? null;
  // A failed NASA POWER lookup shows "unavailable" (kept on screen, with a retry), not "–" (hidden: no data).
  const live = (v: number | undefined, digits = 1) =>
    loading ? "…" : !c ? "unavailable" : v !== undefined ? fmt(v, digits) : "–";
  const POWER = "NASA POWER climatology (MERRA-2, 2001–2025)";

  const elev = detail?.elev;
  const daylightSite = longestDaylight(cell.lat, ORBIT.earth.obliquity, ORBIT.earth.day);
  const daylightTarget = longestDaylight(target.lat, ORBIT[target.world].obliquity, ORBIT[target.world].day);

  const tAvg = fact(/annual average temperature/i);
  const tMax = fact(/annual max temperature/i);
  const marius = target.id === "moon-marius-hills-pit";
  const roverTemps = target.id === "mars-gale" || target.id === "mars-jezero";
  const ti = moon ? undefined : fact(/thermal inertia/i);
  const marsPressure = tt ? 0.636 * Math.exp(-tt.elev / 11100) : NaN;

  const rows: ConditionRow[] = [
    {
      id: "tmean",
      parameter: "Mean temperature",
      units: "°C",
      sv: c?.tmean,
      tv: moon ? (tAvg !== undefined ? K2C(tAvg) : undefined) : -63,
      site: live(c?.tmean, 1),
      target: moon ? (tAvg !== undefined ? fmt(K2C(tAvg)) : marius ? "117 noon / −178 night" : "–") : "≈ −63",
      // Earth's coldest annual mean is about −57 °C (East Antarctic plateau).
      unreachable: moon ? tAvg !== undefined && K2C(tAvg) < -60 : true,
      siteSource: `${POWER}, 2 m air`,
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
      sv: c ? c.tmax - c.tmin : undefined,
      tv: marius ? 295 : roverTemps ? 100 : undefined,
      site: loading ? "…" : c ? fmt(c.tmax - c.tmin, 1) : "unavailable",
      target: moon
        ? marius
          ? "295"
          : tAvg !== undefined && tMax !== undefined
            ? `≥ ${fmt(tMax - tAvg)}`
            : "–"
        : roverTemps
          ? "≈ 100"
          : "not measured",
      // Earth's largest yearly swings (Siberia) are about 100 °C.
      unreachable: marius,
      siteSource: `${POWER}: warmest minus coldest month`,
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
      sv: earthDose(elev ?? NaN),
      tv: moon ? undefined : 640,
      site: fmt(earthDose(elev ?? NaN), 2),
      target: moon ? "no NASA surface value" : "640",
      unreachable: true,
      note: moon ? "No air or magnetic field: higher than Mars" : "No thick air or magnetic field",
      siteSource: "Estimate: UNSCEAR 2000 cosmic + terrestrial background, scaled by AW3D30 elevation",
      targetSource: moon
        ? "Only measured from orbit (LRO CRaTER); no NASA surface dose measurement"
        : "Curiosity RAD, Gale crater surface (Hassler et al. 2014, Science)",
    },
    {
      id: "slope",
      parameter: "Terrain slope",
      units: "° over ~28 km",
      sv: siteValue(site, "slope", cell.cell),
      tv: tt?.slope ?? undefined,
      site: fmt(siteValue(site, "slope", cell.cell), 2),
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
      sv: sand ?? undefined,
      tv: moon ? 55 : undefined,
      site: sand === undefined ? "…" : sand === null ? "no soil data" : fmt(sand, 0),
      target: moon ? "≈ 50–60" : marsGrain(ti),
      note: moon ? undefined : "Mars grain size from thermal inertia",
      siteSource: "ISRIC SoilGrids 2.0, top 5 cm",
      targetSource: moon
        ? "Apollo samples: median grain ≈ 70 µm (Lunar Sourcebook, Carrier et al. 1991)"
        : "MGS TES night thermal inertia, classes after Presley & Christensen 1997",
    },
    {
      id: "pressure",
      parameter: "Atmospheric pressure",
      units: "kPa",
      sv: c?.ps,
      tv: moon ? 0 : marsPressure,
      site: live(c?.ps, 1),
      target: moon ? "0 (vacuum)" : Number.isFinite(marsPressure) ? fmt(marsPressure, 2) : "≈ 0.6",
      unreachable: true,
      siteSource: `${POWER}, surface pressure`,
      targetSource: moon
        ? "No atmosphere"
        : "0.636 kPa at the mean surface (NASA Mars fact sheet), 11.1 km scale height, MOLA height",
    },
    {
      id: "daylight",
      parameter: "Daylight",
      units: "h, longest day",
      sv: daylightSite,
      tv: daylightTarget,
      site: fmt(daylightSite, 1),
      target: fmt(daylightTarget, daylightTarget >= 100 ? 0 : 1),
      unreachable: daylightTarget > 24.05,
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
      sv: c ? c.precip * 365.25 : undefined,
      tv: 0,
      site: loading ? "…" : c ? fmt(c.precip * 365.25, 0) : "unavailable",
      target: moon ? "0 (no air)" : "0 (no rain)",
      siteSource: `${POWER}, corrected precipitation`,
      targetSource: moon ? "No atmosphere" : "Mars air is too thin and cold for liquid rain",
    },
    {
      id: "rh",
      parameter: "Relative humidity",
      units: "%",
      sv: c?.rh,
      tv: 0,
      site: live(c?.rh, 0),
      target: moon ? "0 (no air)" : "≈ 0 by day",
      siteSource: `${POWER}, 2 m air`,
      targetSource: moon ? "No atmosphere" : "Curiosity REMS-H: a few % by day, near frost point at night",
    },
    {
      id: "aod",
      parameter: "Dust activity",
      units: "AOD",
      sv: c?.aod,
      tv: moon ? 0 : 0.5,
      site: live(c?.aod, 2),
      target: moon ? "0 (no air)" : "0.3–1",
      note: moon ? undefined : "Global dust storms raise Mars's value far higher",
      siteSource: `${POWER}, aerosol optical depth at 550 nm`,
      targetSource: moon
        ? "No atmosphere to hold dust"
        : "Spirit and Opportunity Pancam sky record (Lemmon et al. 2015)",
    },
    {
      id: "isolation",
      parameter: "Isolation",
      units: "km to nearest town",
      sv: siteValue(site, "isolation", cell.cell),
      tv: moon ? 384400 : 2.25e8,
      site: fmt(siteValue(site, "isolation", cell.cell), 0),
      target: moon ? "384,400" : "≈ 225 million",
      unreachable: true,
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
      site: fmt(elev ?? NaN, 0),
      target: tt ? fmt(tt.elev, 0) : "–",
      note: "Each world uses its own zero level",
      siteSource: "JAXA ALOS AW3D30 DSM (0.2°), height above sea level",
      targetSource: tt?.source ?? "No elevation model at this site in our data",
    },
    {
      id: "water",
      parameter: "Aqueous geochemistry",
      units: "water-formed minerals or ice",
      // Same answer to "is there water-formed material?" on both sides scores a full match, a different one none.
      match: (() => {
        const w = earthWater(known);
        return w === null ? undefined : (w !== "None recorded") === !(moon && marius) ? 1 : 0;
      })(),
      site: earthWater(known) ?? "Not catalogued",
      target: moon ? (marius ? "None (dry basalt)" : "Water ice in cold traps") : (MARS_WATER[target.id]?.[0] ?? "–"),
      siteSource: known ? "Site geology notes (lib/data/sites.ts)" : "Only known analogue sites are catalogued",
      targetSource: moon
        ? marius
          ? "Apollo and LRO: lunar basalt formed without water"
          : "LCROSS impact (2009) and LRO LAMP, Diviner"
        : (MARS_WATER[target.id]?.[1] ?? "–"),
    },
  ];
  return rows.map(withMatch);
}
