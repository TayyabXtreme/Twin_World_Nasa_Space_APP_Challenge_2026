/**
 * Low-precision heliocentric positions for Earth and Mars, and a mean Moon.
 * Source: NASA JPL, "Keplerian Elements for Approximate Positions of the Major Planets"
 * (Standish, Table 1, valid 1800–2050). Inclination is ignored (Mars: 1.85°), which keeps
 * Earth–Mars distances within about 1% — good enough for a teaching instrument, and labeled as approximate.
 */

const DEG = Math.PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12); // JD 2451545.0
const MS_PER_DAY = 86_400_000;

export const AU_KM = 149_597_870.7;
export const LIGHT_SECONDS_PER_AU = 499.004784;
export const MOON_DISTANCE_KM = 384_400;
export const MOON_LIGHT_SECONDS = MOON_DISTANCE_KM / 299_792.458;

interface Elements {
  a: [number, number];
  e: [number, number];
  L: [number, number];
  peri: [number, number];
}

const EARTH: Elements = {
  a: [1.00000261, 0.00000562],
  e: [0.01671123, -0.00004392],
  L: [100.46457166, 35999.37244981],
  peri: [102.93768193, 0.32327364],
};

const MARS: Elements = {
  a: [1.52371034, 0.00001847],
  e: [0.0933941, 0.00007882],
  L: [-4.55343205, 19140.30268499],
  peri: [-23.94362959, 0.44441088],
};

export interface HelioPosition {
  /** Ecliptic longitude, radians, counter-clockwise seen from ecliptic north. */
  lon: number;
  /** Distance from the Sun, AU. */
  r: number;
  x: number;
  y: number;
}

export function daysSinceJ2000(date: Date) {
  return (date.getTime() - J2000) / MS_PER_DAY;
}

export function dateFromDays(days: number) {
  return new Date(J2000 + days * MS_PER_DAY);
}

function solveKepler(M: number, e: number) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

function position(el: Elements, days: number): HelioPosition {
  const T = days / 36525;
  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const L = (el.L[0] + el.L[1] * T) * DEG;
  const peri = (el.peri[0] + el.peri[1] * T) * DEG;
  let M = (L - peri) % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI;
  if (M < -Math.PI) M += 2 * Math.PI;
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const lon = Math.atan2(yp, xp) + peri;
  const r = Math.hypot(xp, yp);
  return { lon, r, x: r * Math.cos(lon), y: r * Math.sin(lon) };
}

export const earthAt = (days: number) => position(EARTH, days);
export const marsAt = (days: number) => position(MARS, days);

/** Mean geocentric ecliptic longitude of the Moon, radians (ignores perturbations; display only). */
export function moonLongitudeAt(days: number) {
  return ((218.316 + 13.176396 * days) % 360) * DEG;
}

export function earthMarsDistanceAU(days: number) {
  const e = earthAt(days);
  const m = marsAt(days);
  return Math.hypot(m.x - e.x, m.y - e.y);
}

/** Path of one full orbit (for the engraved track), sampled at the given epoch. */
export function orbitPath(body: "earth" | "mars", days: number, samples = 180) {
  const period = body === "earth" ? 365.256 : 686.98;
  const at = body === "earth" ? earthAt : marsAt;
  return Array.from({ length: samples }, (_, i) => at(days + (i / samples) * period));
}

export function formatLightTime(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m} min ${String(s).padStart(2, "0")} s`;
}
