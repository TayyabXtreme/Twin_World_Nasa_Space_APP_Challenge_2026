/**
 * South polar stereographic projection used by every Moon base map layer (LOLA convention): a 1737.4 km sphere,
 * true scale at the pole, 0° longitude pointing up and 90°E to the right. Map units are kilometres, so the
 * Leaflet CRS.Simple coordinate [lat, lng] is simply [y km, x km].
 */

export const MOON_R_KM = 1737.4;
/** The LOLA 75°S grid spans ±457.44 km (3812 px × 240 m). */
export const HALF_W_KM = 457.44;

const RAD = Math.PI / 180;

export function toXY(lat: number, lon: number): [x: number, y: number] {
  const r = 2 * MOON_R_KM * Math.tan((45 + lat / 2) * RAD);
  return [r * Math.sin(lon * RAD), r * Math.cos(lon * RAD)];
}

export function toLatLon(x: number, y: number): [lat: number, lon: number] {
  const r = Math.hypot(x, y);
  const lat = (2 * Math.atan(r / (2 * MOON_R_KM))) / RAD - 90;
  const lon = Math.atan2(x, y) / RAD;
  return [lat, lon];
}

/** Grid cell (row 0 at the top) holding map point x, y; null outside the grid. */
export function cellAt(x: number, y: number, size: number, halfW = HALF_W_KM): { row: number; col: number } | null {
  const px = (2 * halfW) / size;
  const col = Math.floor((x + halfW) / px);
  const row = Math.floor((halfW - y) / px);
  if (col < 0 || row < 0 || col >= size || row >= size) return null;
  return { row, col };
}

/** Centre of grid cell (row, col) in map km. */
export function cellCentre(row: number, col: number, size: number, halfW = HALF_W_KM): [x: number, y: number] {
  const px = (2 * halfW) / size;
  return [-halfW + (col + 0.5) * px, halfW - (row + 0.5) * px];
}

/** Distance between two map points, km (stereographic distortion is < 2 % inside 75°S). */
export const distKm = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function formatLat(lat: number, digits = 2) {
  return `${Math.abs(lat).toFixed(digits)}°${lat < 0 ? "S" : "N"}`;
}

export function formatLon(lon: number, digits = 1) {
  const l = ((((lon + 180) % 360) + 360) % 360) - 180;
  return `${Math.abs(l).toFixed(digits)}°${l < 0 ? "W" : "E"}`;
}
