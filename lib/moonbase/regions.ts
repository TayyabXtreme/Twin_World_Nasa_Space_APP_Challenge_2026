import data from "./artemis-regions.json";
import { toLatLon, toXY } from "./projection";

/**
 * NASA's nine Artemis III candidate landing regions (Oct 2024). NASA published them as a map only, so each
 * region's centre and extent here are APPROXIMATE: the mean position and spread of the candidate landing sites
 * that Wueller et al. (2026, JGR Planets) published inside it. Same rule as scripts/build-moon-layers.py.
 */
export interface ArtemisRegion {
  id: string;
  name: string;
  short: string;
  note: string;
  siteId: string | null;
  /** Published landing sites, [lat, lon]. */
  sites: [number, number][];
  x: number;
  y: number;
  lat: number;
  lon: number;
  radiusKm: number;
}

export const REGION_SOURCES = data.sources;
export const REGIONS_ABOUT = data.about;

export const ARTEMIS_REGIONS: ArtemisRegion[] = data.regions.map((r) => {
  const sites = r.sites as [number, number][];
  const pts = sites.map(([la, lo]) => toXY(la, lo));
  const x = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const y = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const spread = Math.max(...pts.map((p) => Math.hypot(p[0] - x, p[1] - y)));
  const [lat, lon] = toLatLon(x, y);
  return { ...r, sites, x, y, lat, lon, radiusKm: Math.max(4, spread + 2) };
});

export const POLAR_FEATURES = data.features.map((f) => {
  const [x, y] = toXY(f.lat, f.lon);
  return { ...f, x, y };
});
