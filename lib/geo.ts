/**
 * Coordinate helpers shared by the 3D globe and the 2D map.
 * Convention: latitude −90..90, longitude −180..180 (east-positive),
 * equirectangular textures centered on 0° longitude.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

const DEG = Math.PI / 180;

/** Lat/lon → unit-sphere position matching three.js SphereGeometry UV layout. */
export function latLonToVec3(lat: number, lon: number, radius = 1): [number, number, number] {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

/** Unit-sphere position → lat/lon (inverse of latLonToVec3). */
export function vec3ToLatLon(x: number, y: number, z: number): LatLon {
  const r = Math.hypot(x, y, z) || 1;
  const lat = 90 - Math.acos(Math.min(1, Math.max(-1, y / r))) / DEG;
  let lon = Math.atan2(z, -x) / DEG - 180;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

/** Sphere UV (as returned by a raycast hit) → lat/lon. */
export function uvToLatLon(u: number, v: number): LatLon {
  return { lat: v * 180 - 90, lon: u * 360 - 180 };
}

/** Lat/lon → pixel in an equirectangular image of the given size. */
export function latLonToPixel(lat: number, lon: number, width: number, height: number) {
  const x = Math.floor(((lon + 180) / 360) * width) % width;
  const y = Math.min(height - 1, Math.floor(((90 - lat) / 180) * height));
  return { x, y };
}

/** Great-circle distance in km. */
export function haversineKm(a: LatLon, b: LatLon, radiusKm: number) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

/** Points on a small circle (e.g. a crater rim) of `radiusKm` around a center, for drawing rings. */
export function geodesicCircle(center: LatLon, radiusKm: number, bodyRadiusKm: number, segments = 96): LatLon[] {
  const d = radiusKm / bodyRadiusKm;
  const lat1 = center.lat * DEG;
  const lon1 = center.lon * DEG;
  const pts: LatLon[] = [];
  for (let i = 0; i <= segments; i++) {
    const brg = (i / segments) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
    const lon2 =
      lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    pts.push({ lat: lat2 / DEG, lon: ((((lon2 / DEG + 540) % 360) + 360) % 360) - 180 });
  }
  return pts;
}

export function formatLat(lat: number) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
}

export function formatLon(lon: number) {
  return `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}
