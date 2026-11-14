import type { ArtemisRegion } from "./regions";

/**
 * Region close-ups: LRO imagery from NASA Moon Trek's south polar tile services, plus the Sun and Earth geometry for
 * "what a crew would see".
 *
 * Moon Trek south polar stereographic (IAU2000:30120) WMTS, checked 2026-11-14: every layer below answered 200 for
 * its WMTSCapabilities.xml, and all 1 188 tiles the nine close-ups request at zooms 6 to 9 answered 200 with CORS.
 * Layer IDs come from Trek's own polar catalogue (TrekServices index/polar/searchItems, proj IAU2000:30120).
 * All Trek SP layers share one grid: top-left corner (-1 095 930 m, +1 095 930 m), 256 px tiles, and at zoom z the
 * first 2^z columns and rows span the full 2 191 860 m (Trek reuses a 2:1 global matrix, so the right half is
 * empty). Same projection and orientation as our LOLA-based layers (0° up, 90°E right), verified by overlaying.
 */

export const TREK_SP_HALF_M = 1_095_930;
export const TREK_SP_SPAN_M = 2 * TREK_SP_HALF_M;
/** Our display images (public/data/moonbase/*.webp) cover the LOLA 75°S grid, ±457.44 km. */
export const OUR_HALF_M = 457_440;

export interface TrekLayer {
  id: string;
  label: string;
  short: string;
  /** Highest zoom Trek serves (from WMTSCapabilities). */
  maxNativeZoom: number;
  /** Data extent in map metres (half-width of a square around the pole). */
  halfM: number;
  credit: string;
  /** Pixel size at maxNativeZoom, metres. */
  pixelM: number;
}

const z = (maxNativeZoom: number) => TREK_SP_SPAN_M / 256 / 2 ** maxNativeZoom;

export const TREK = {
  nac: {
    id: "LRO_NAC_Mosaic_SPole85.5_1mp",
    label: "LROC NAC mosaic",
    short: "NAC 1 m",
    maxNativeZoom: 11,
    halfM: 136_526,
    credit: "NASA/GSFC/Arizona State University · LRO LROC NAC south polar mosaic, via NASA Moon Trek",
    pixelM: z(11),
  },
  wac: {
    id: "LRO_WAC_Mosaic_SPole60_100m_v02",
    label: "LROC WAC mosaic",
    short: "WAC",
    maxNativeZoom: 5,
    halfM: 1_095_600,
    credit: "NASA/GSFC/Arizona State University · LRO LROC WAC south polar mosaic, via NASA Moon Trek",
    pixelM: z(5),
  },
  hillshade: {
    id: "LRO_LOLA_Shade_SPole75_30mp_v04",
    label: "LOLA hillshade",
    short: "LOLA",
    maxNativeZoom: 6,
    halfM: 457_440,
    credit: "NASA/GSFC · LRO LOLA 30 m south polar hillshade, via NASA Moon Trek",
    pixelM: z(6),
  },
  sunlight: {
    id: "LRO_LOLA_Illumination_SPole65S_240m",
    label: "Average sunlight (LOLA)",
    short: "Sunlight",
    maxNativeZoom: 3, // Trek serves this 240 m product only down to about 535 m per pixel
    halfM: 770_640,
    credit: "NASA/GSFC · LRO LOLA average illumination, via NASA Moon Trek",
    pixelM: z(3),
  },
  psr: {
    id: "NAC_POLE_PSR_SOUTH_STRETCH",
    label: "Inside the shadows (NAC)",
    short: "PSR",
    maxNativeZoom: 8,
    halfM: 304_010,
    credit: "NASA/GSFC/Arizona State University · LROC NAC permanently shadowed region mosaic (stretched), via NASA Moon Trek",
    pixelM: z(8),
  },
} satisfies Record<string, TrekLayer>;

export type TrekKey = keyof typeof TREK;

export const trekTileUrl = (l: TrekLayer) => `https://trek.nasa.gov/tiles/Moon/SP/${l.id}/1.0.0/default/default028mm/{z}/{y}/{x}.png`;

/** Half-width of a region's close-up box, metres: the region plus a margin of terrain around it. */
export const closeupHalfM = (r: ArtemisRegion) => Math.max(14_000, r.radiusKm * 1000 * 1.35);

/** Does the 1 m NAC mosaic cover the whole close-up box? (It stops about 136 km from the pole, near 85.5°S.) */
export function nacCovers(r: ArtemisRegion) {
  const half = closeupHalfM(r);
  return Math.abs(r.x * 1000) + half <= TREK.nac.halfM && Math.abs(r.y * 1000) + half <= TREK.nac.halfM;
}

/* ---------------- Sun and Earth from the lunar south pole ---------------- */

const RAD = Math.PI / 180;
/** Lunar spin axis tilt to the ecliptic: the Sun's declination on the Moon never exceeds this. */
const SUN_DECL_MAX = 1.54;
/** Optical libration amplitudes: latitude (draconic month) and longitude (anomalistic month). */
const LIB_LAT = 6.7;
const LIB_LON = 7.9;

/** Highest the Sun ever gets above a flat horizon at this latitude, degrees. */
export const sunMaxElevation = (lat: number) => 90 - Math.abs(lat) + SUN_DECL_MAX;

/** Length of a 1.8 m astronaut's shadow with the Sun at `elevationDeg`, metres. */
export const shadowLength = (elevationDeg: number, height = 1.8) => height / Math.tan(elevationDeg * RAD);

/**
 * Earth above a smooth horizon: share of time and highest elevation, from the optical librations (the sub-Earth
 * point wanders ±6.7° in latitude over 27.21 days and ±7.9° in longitude over 27.55 days). Terrain is ignored, so
 * a ridge can still hide Earth; parallax (under 1°) is ignored too.
 */
export function earthVisibility(lat: number, lon: number) {
  let above = 0;
  let max = -90;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * 27.21 * 27.55; // long enough for both cycles to mix
    const latE = LIB_LAT * Math.sin((2 * Math.PI * t) / 27.21) * RAD;
    const lonE = LIB_LON * Math.sin((2 * Math.PI * t) / 27.55) * RAD;
    const el = Math.asin(Math.sin(lat * RAD) * Math.sin(latE) + Math.cos(lat * RAD) * Math.cos(latE) * Math.cos((lon * RAD) - lonE)) / RAD;
    if (el > 0) above++;
    if (el > max) max = el;
  }
  return { share: above / N, maxElevation: max };
}

/** What only this place adds to a crew's view (sources in the region panel). */
export const CREW_NOTES: Record<string, string> = {
  "peak-near-cabeus-b":
    "A small peak looking out over Cabeus crater, where NASA's LCROSS probe hit the permanently shadowed floor in 2009 and found water in the plume.",
  haworth:
    "Ridges on the edge of Haworth, a crater about 51 km wide whose floor never sees the Sun: from the rim a crew looks down into black shadow.",
  "malapert-massif":
    "The slopes of a mountain about 5 km high that faces Earth, one of the best places near the pole to talk to Earth directly.",
  "mons-mouton-plateau":
    "The broad, nearly flat top of Mons Mouton, a mesa several kilometres high. Intuitive Machines' Athena lander (IM-2) touched down on this plateau in March 2025.",
  "mons-mouton":
    "The southern edge of the Mons Mouton mesa, where the flat top breaks into slopes falling toward the pole.",
  "nobile-rim-1":
    "Beside the western rim of Nobile, a crater about 73 km wide with a permanently shadowed floor. NASA had aimed its VIPER rover at this edge of Nobile before the mission was cancelled in 2024.",
  "nobile-rim-2":
    "The northern rim of Nobile, where it runs into an unnamed crater about 55 km wide: big shadowed bowls on two sides.",
  "de-gerlache-rim-2":
    "The rim of de Gerlache crater, on the ridge running toward Shackleton: some of the most often sunlit ground at the pole, next to craters that are always dark.",
  "slater-plain":
    "A plain on the far side near Slater crater. With Earth low or hidden for long stretches, a crew here would rely on relay satellites for radio contact.",
};
