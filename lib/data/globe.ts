import photos from "./globe-photos.generated.json";
import type { Site } from "./types";

/**
 * Earth globe layers and the photos behind each pin. Card views are built by scripts/build-globe-photos.py from
 * NASA Worldview snapshots and Copernicus Sentinel quicklooks (assets-raw/nasa); the ground photo is the site's own.
 */

/** Earth layers, plus "landings": the Moon and Mars exploration history (lib/data/landings.ts, its own panel). */
export type GlobeLayerId = "analogues" | "pakistan" | "campaigns" | "launch" | "dsn" | "iss" | "landings";

export interface GlobeLayer {
  id: GlobeLayerId;
  label: string;
  hint: string;
  /** CSS colour token for the pin ring and the toggle swatch. */
  color: string;
}

/** The Earth layer toggles. */
export const GLOBE_LAYERS: GlobeLayer[] = [
  { id: "analogues", label: "Analogue sites", hint: "Places space agencies and scientists study for the Moon and Mars", color: "var(--primary)" },
  { id: "pakistan", label: "Pakistan", hint: "Proposed analogues, not NASA field sites", color: "oklch(0.84 0.15 85)" },
  { id: "campaigns", label: "Field campaigns", hint: "Where NASA crews rehearse Moon and Mars missions", color: "oklch(0.76 0.15 305)" },
  { id: "launch", label: "Launch sites", hint: "Spaceports that sent famous missions up", color: "oklch(0.72 0.19 20)" },
  { id: "dsn", label: "Deep Space Network", hint: "NASA's three giant antenna sites, with live-style signal arcs", color: "oklch(0.8 0.12 225)" },
  { id: "iss", label: "Space Station (live)", hint: "Position computed in your browser from its orbit data", color: "oklch(0.97 0 0)" },
];


export const layerOf = (site: Site): GlobeLayerId => (site.region.endsWith("Pakistan") ? "pakistan" : "analogues");

export type PhotoKind = "ground" | "s2" | "wv" | "s1";

export interface PhotoView {
  kind: PhotoKind;
  label: string;
  src: string;
  alt: string;
  credit: string;
  /** Pixel size for static views; undefined for the site photo (served through next/image). */
  w?: number;
  h?: number;
  date?: string;
  note?: string;
}

interface RawView {
  kind: "s2" | "wv" | "s1";
  src: string;
  w: number;
  h: number;
  date: string;
  scene?: string;
}

const PHOTOS = photos as Record<string, { pin: string; views: RawView[] }>;

const ORBIT: Record<RawView["kind"], { label: string; what: string; credit: (year: string) => string; note: string }> = {
  s2: {
    label: "Sentinel-2",
    what: "Sentinel-2 true-colour quicklook",
    credit: (y) => `Contains modified Copernicus Sentinel data ${y} · ESA`,
    note: "Whole 110 km tile around the site, about 320 m per pixel.",
  },
  wv: {
    label: "MODIS",
    what: "MODIS Terra true-colour snapshot",
    credit: () => "NASA Worldview · GIBS, MODIS Terra",
    note: "About 130 km across, centred on the site.",
  },
  s1: {
    label: "Radar",
    what: "Sentinel-1 radar quicklook (false colour)",
    credit: (y) => `Contains modified Copernicus Sentinel data ${y} · ESA`,
    note: "C-band radar sees through cloud and at night; colours are polarisations, not true colour.",
  },
};

export const pinPhoto = (siteId: string): string | undefined => PHOTOS[siteId]?.pin;

/** Ground or headline photo first, then the orbital views that exist for this site. */
export function photoViews(site: Site): PhotoView[] {
  const out: PhotoView[] = [];
  const raw = PHOTOS[site.id]?.views ?? [];
  // A Sentinel-2 quicklook used as the headline image is not repeated as its own tab.
  const headlineIsS2 = raw.some((v) => v.kind === "s2" && v.src === site.image?.src);
  if (site.image) {
    out.push({
      kind: headlineIsS2 ? "s2" : "ground",
      label: headlineIsS2 ? "Sentinel-2" : "Photo",
      src: site.image.src,
      alt: site.image.alt,
      credit: site.image.credit,
      ...(headlineIsS2 && { ...sizeOf(raw, site.image.src), note: ORBIT.s2.note }),
    });
  }
  for (const v of raw) {
    if (v.src === site.image?.src) continue;
    const o = ORBIT[v.kind];
    out.push({ kind: v.kind, label: o.label, src: v.src, alt: `${o.what}, ${site.name}`, credit: o.credit(v.date.slice(0, 4)), w: v.w, h: v.h, date: v.date, note: o.note });
  }
  return out;
}

function sizeOf(raw: RawView[], src: string) {
  const v = raw.find((r) => r.src === src)!;
  return { w: v.w, h: v.h, date: v.date };
}
