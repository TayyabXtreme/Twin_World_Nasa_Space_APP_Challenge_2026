import { eciToGeodetic, degreesLat, degreesLong, gstime, propagate, twoline2satrec } from "satellite.js";

/**
 * ISS position from its two-line element set (TLE), propagated in the browser with SGP4 (satellite.js 6, plain
 * JavaScript: v7 ships a multi-threaded WebAssembly build whose self-spawning worker makes Turbopack builds hang).
 * Loaded on demand by the globe's ISS layer, so the propagator is only downloaded when that layer is on.
 */

export interface IssTle {
  name: string;
  line1: string;
  line2: string;
  source: string;
  fetched: string;
  stale?: boolean;
}

export interface IssFix {
  lat: number;
  lon: number;
  altKm: number;
  speedKms: number;
  at: number;
}

export interface IssTracker {
  tle: IssTle;
  /** TLE epoch, ms since 1970. */
  epoch: number;
  /** Orbital period in minutes, from the mean motion. */
  periodMin: number;
  at: (ms: number) => IssFix | null;
  /** Ground track from `fromMin` to `toMin` minutes around `ms`, every `stepS` seconds. */
  track: (ms: number, fromMin: number, toMin: number, stepS: number) => IssFix[];
}

export async function loadIssTracker(): Promise<IssTracker> {
  const tle = (await fetch("/api/iss-tle").then((r) => r.json())) as IssTle;
  const satrec = twoline2satrec(tle.line1, tle.line2);
  const at = (ms: number): IssFix | null => {
    const date = new Date(ms);
    const pv = propagate(satrec, date);
    // satellite.js reports a failed propagation as null or as position/velocity `false` (despite its types).
    if (!pv || typeof pv.position !== "object" || typeof pv.velocity !== "object") return null;
    const geo = eciToGeodetic(pv.position, gstime(date));
    const v = pv.velocity;
    return { lat: degreesLat(geo.latitude), lon: degreesLong(geo.longitude), altKm: geo.height, speedKms: Math.hypot(v.x, v.y, v.z), at: ms };
  };
  return {
    tle,
    epoch: (satrec.jdsatepoch - 2440587.5) * 86_400_000,
    periodMin: (2 * Math.PI) / satrec.no,
    at,
    track: (ms, fromMin, toMin, stepS) => {
      const out: IssFix[] = [];
      for (let t = fromMin * 60; t <= toMin * 60; t += stepS) {
        const f = at(ms + t * 1000);
        if (f) out.push(f);
      }
      return out;
    },
  };
}
