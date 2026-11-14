/**
 * Recent satellite imagery of any Earth place from NASA GIBS (no login), plus matching NASA Worldview permalinks.
 *
 *  - Images: GIBS WMS GetMap snapshots (EPSG:4326), CORS-enabled, so the browser can measure the pixels.
 *  - Dates: GIBS DescribeDomains lists exactly which dates exist for a layer; requested dates snap to the newest
 *    available date on or before them (daily swaths have outages; 8- and 16-day composites only exist on their
 *    period start dates).
 *  - Honesty: GIBS answers HTTP 200 even when there is nothing to show (an all-black JPEG for swath imagery, a fully
 *    transparent PNG for composites), so every image is measured for no-data and bright (cloud, snow, ice or salt)
 *    pixels before we say anything about it.
 *
 * Layer IDs match lib/layers.ts and were checked against GIBS on 2026-11-14 (WMS 200, DescribeDomains ranges).
 * No app imports here, so scripts can load this file directly with Node.
 */

export type SatGroup = "true" | "lst" | "ndvi";

export interface SatProduct {
  id: string;
  group: SatGroup;
  label: string;
  /** GIBS layer identifier (same as Worldview's). */
  layer: string;
  /** WMTS tile matrix set, needed for DescribeDomains. */
  matrix: string;
  format: "image/jpeg" | "image/png";
  /** Days per image: 1 for daily swaths, 8 / 16 for composites. */
  periodDays: number;
  /** First date GIBS has (DescribeDomains). */
  start: string;
  /** Local overpass time or composite note, shown under the image. */
  note: string;
  /** Legend JSON in public/data/layers (composites only). */
  legend?: string;
}

export const SAT_PRODUCTS: SatProduct[] = [
  {
    id: "viirs-noaa20",
    group: "true",
    label: "VIIRS · NOAA-20",
    layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    matrix: "250m",
    format: "image/jpeg",
    periodDays: 1,
    start: "2018-01-05",
    note: "Daily true colour, about 375 m per pixel, overpass around 13:30 local time.",
  },
  {
    id: "viirs-noaa21",
    group: "true",
    label: "VIIRS · NOAA-21",
    layer: "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
    matrix: "250m",
    format: "image/jpeg",
    periodDays: 1,
    start: "2023-02-10",
    note: "Daily true colour, about 375 m per pixel, overpass around 13:30 local time.",
  },
  {
    id: "modis-terra",
    group: "true",
    label: "MODIS · Terra",
    layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
    matrix: "250m",
    format: "image/jpeg",
    periodDays: 1,
    start: "2000-02-24",
    note: "Daily true colour, 250 m per pixel, morning overpass (Terra has drifted later in recent years).",
  },
  {
    id: "modis-aqua",
    group: "true",
    label: "MODIS · Aqua",
    layer: "MODIS_Aqua_CorrectedReflectance_TrueColor",
    matrix: "250m",
    format: "image/jpeg",
    periodDays: 1,
    start: "2002-07-03",
    note: "Daily true colour, 250 m per pixel, afternoon overpass.",
  },
  {
    id: "lst-day",
    group: "lst",
    label: "Land temperature (day)",
    layer: "MODIS_Terra_L3_Land_Surface_Temp_8Day_Day",
    matrix: "1km",
    format: "image/png",
    periodDays: 8,
    start: "2000-02-26",
    note: "MODIS Terra 8-day composite of clear-sky daytime ground temperature, 1 km.",
    legend: "earth-lst-day",
  },
  {
    id: "ndvi",
    group: "ndvi",
    label: "Vegetation (NDVI)",
    layer: "MODIS_Terra_L3_NDVI_16Day",
    matrix: "250m",
    format: "image/png",
    periodDays: 16,
    start: "2000-03-05",
    note: "MODIS Terra 16-day vegetation index composite, 250 m.",
    legend: "earth-ndvi",
  },
];

export const satProduct = (id: string) => SAT_PRODUCTS.find((p) => p.id === id) ?? SAT_PRODUCTS[0];

/* ---------------- Dates ---------------- */

const DAY = 86_400_000;
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso: string, n: number) => isoDay(dayMs(iso) + n * DAY);

/** Parse DescribeDomains intervals ("2026-01-09/2026-11-01/P8D", single dates, comma-separated). */
export function parseDomain(xml: string): { start: number; end: number; step: number }[] {
  const domains = [...xml.matchAll(/<Domain>([\s\S]*?)<\/Domain>/g)].map((m) => m[1].trim());
  const time = domains.at(-1) ?? "";
  return time
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [a, b, p] = s.split("/");
      const days = p ? Number(/P(\d+)D/.exec(p)?.[1] ?? 1) : 1;
      return { start: dayMs(a.slice(0, 10)), end: dayMs((b ?? a).slice(0, 10)), step: days * DAY };
    });
}

/** Newest available date on or before `iso`, or null if the layer has nothing that early in the window. */
export function snapDate(intervals: { start: number; end: number; step: number }[], iso: string): string | null {
  const want = dayMs(iso);
  let best = -Infinity;
  for (const iv of intervals) {
    if (iv.start > want) continue;
    const last = Math.min(iv.end, want);
    const k = Math.floor((last - iv.start) / iv.step);
    best = Math.max(best, iv.start + k * iv.step);
  }
  return Number.isFinite(best) ? isoDay(best) : null;
}

/** Newest date the layer has at all (for the picker's default). */
export const latestDate = (intervals: { start: number; end: number; step: number }[]) =>
  intervals.length ? snapDate(intervals, isoDay(Math.max(...intervals.map((i) => i.end)))) : null;

const GIBS_WMTS = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0";
export const domainUrl = (p: SatProduct, from: string, to: string) => `${GIBS_WMTS}/${p.layer}/default/${p.matrix}/all/${from}--${to}.xml`;

/* ---------------- Area and URLs ---------------- */

export interface Box {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * A box around the place about `kmTall` high, widened so the image (aspect w/h) is not squashed at high latitudes.
 */
export function boxAround(lat: number, lon: number, aspect: number, kmTall = 150): Box {
  const dLat = kmTall / 111 / 2;
  const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const dLon = Math.min(60, (dLat * aspect) / cos);
  const south = Math.max(-90, lat - dLat);
  const north = Math.min(90, lat + dLat);
  return { south, north, west: lon - dLon, east: lon + dLon };
}

const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

/** WMS 1.3.0 GetMap; EPSG:4326 axis order is lat,lon in BBOX. */
export function snapshotUrl(p: SatProduct, date: string, box: Box, width: number, height: number) {
  const q = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: p.layer,
    STYLES: "",
    CRS: "EPSG:4326",
    BBOX: [box.south, box.west, box.north, box.east].map((v) => v.toFixed(4)).join(","),
    WIDTH: String(Math.round(width)),
    HEIGHT: String(Math.round(height)),
    FORMAT: p.format,
    TIME: date,
  });
  if (p.format === "image/png") q.set("TRANSPARENT", "TRUE");
  return `${GIBS_WMS}?${q}`;
}

/**
 * NASA Worldview permalink: same area, layer and date. Composites sit over NOAA-20 true colour for context;
 * coastlines on top. Worldview lists layers top first.
 */
export function worldviewLink(p: SatProduct, date: string, box: Box) {
  const layers = p.group === "true" ? ["Coastlines_15m", p.layer] : ["Coastlines_15m", p.layer, "VIIRS_NOAA20_CorrectedReflectance_TrueColor"];
  const v = [box.west, box.south, box.east, box.north].map((x) => x.toFixed(3)).join(",");
  return `https://worldview.earthdata.nasa.gov/?v=${v}&l=${layers.join(",")}&t=${date}-T00%3A00%3A00Z`;
}

/* ---------------- Measuring an image ---------------- */

export interface ImageStats {
  /** Fraction with no data: black (swath gaps, night, not yet processed) or transparent (composite gaps, water). */
  noData: number;
  /** Fraction of bright, colourless pixels in true colour: cloud, snow, ice or salt (they look alike). */
  bright: number;
}

/** `rgba` as from getImageData; `alphaMeansData` for PNG composites (transparent = no data). */
export function measure(rgba: Uint8ClampedArray, alphaMeansData: boolean): ImageStats {
  let none = 0;
  let bright = 0;
  const n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    if (alphaMeansData ? a < 8 : r + g + b < 15) {
      none++;
      continue;
    }
    const lo = Math.min(r, g, b);
    if (!alphaMeansData && lo > 175 && Math.max(r, g, b) - lo < 35) bright++;
  }
  return { noData: none / n, bright: bright / Math.max(1, n - none) };
}

/** Read a value from a composite pixel with the legend's colour table ([r, g, b, low, high] rows). */
export function valueFromTable(table: [number, number, number, number, number][], r: number, g: number, b: number) {
  let best: (typeof table)[number] | null = null;
  let bestD = Infinity;
  for (const row of table) {
    const d = (row[0] - r) ** 2 + (row[1] - g) ** 2 + (row[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = row;
    }
  }
  return best && bestD <= 300 ? { low: best[3], high: best[4] } : null;
}
