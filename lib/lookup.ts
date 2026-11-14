"use client";

import { geoBounds, geoContains } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { haversineKm } from "./geo";
import { WORLD_CONFIG, type World } from "./worlds";

/**
 * What is under the pointer: a country on Earth, the smallest named feature containing the point on the
 * Moon or Mars, and (Moon/Mars) the elevation from the 2k LOLA/MOLA heightmap.
 * Everything loads lazily, once per world, and lookups are cheap enough to run on every pointer move.
 */

export interface PlaceInfo {
  label?: string;
  sublabel?: string;
  elevationM?: number;
}

/* ---------- Earth: countries ---------- */

interface Country {
  name: string;
  feature: Feature<Geometry>;
  bounds: [[number, number], [number, number]];
}

let countriesPromise: Promise<Country[]> | null = null;
function loadCountries() {
  countriesPromise ??= fetch("/data/countries-110m.topo.json")
    .then((r) => r.json() as Promise<Topology>)
    .then((topo) => {
      const fc = feature(topo, topo.objects.countries) as unknown as { features: Feature<Geometry, { name: string }>[] };
      return fc.features.map((f) => ({ name: f.properties.name, feature: f, bounds: geoBounds(f) }));
    });
  return countriesPromise;
}

function inBounds(b: Country["bounds"], lon: number, lat: number) {
  const [[x0, y0], [x1, y1]] = b;
  if (lat < y0 || lat > y1) return false;
  return x0 <= x1 ? lon >= x0 && lon <= x1 : lon >= x0 || lon <= x1; // bounds that cross the antimeridian
}

/* ---------- Moon / Mars: named features ---------- */

interface NamedFeature {
  n: string;
  t: string;
  la: number;
  lo: number;
  d: number;
}
interface FeatureIndex {
  buckets: Map<string, NamedFeature[]>;
}

const BUCKET = 5;
const bucketKey = (lat: number, lon: number) => `${Math.floor((lat + 90) / BUCKET)}:${Math.floor((((lon + 180) % 360) + 360) % 360 / BUCKET)}`;

const featurePromises: Partial<Record<World, Promise<FeatureIndex>>> = {};
function loadFeatures(world: "moon" | "mars") {
  featurePromises[world] ??= Promise.all([
    fetch(`/data/${world}-features-t1.json`).then((r) => r.json() as Promise<NamedFeature[]>),
    fetch(`/data/${world}-features-t2.json`).then((r) => r.json() as Promise<NamedFeature[]>),
  ]).then(([t1, t2]) => {
    const radiusKm = WORLD_CONFIG[world].radiusKm;
    const buckets = new Map<string, NamedFeature[]>();
    for (const f of [...t1, ...t2]) {
      // Register the feature in every bucket its disc can touch.
      const rDeg = (f.d / 2 / radiusKm) * (180 / Math.PI);
      const latSpan = Math.ceil(rDeg / BUCKET);
      const lonSpan = Math.min(36, Math.ceil(rDeg / Math.max(0.1, Math.cos((f.la * Math.PI) / 180)) / BUCKET));
      for (let i = -latSpan; i <= latSpan; i++) {
        for (let j = -lonSpan; j <= lonSpan; j++) {
          const key = bucketKey(Math.max(-90, Math.min(89.99, f.la + i * BUCKET)), f.lo + j * BUCKET);
          const list = buckets.get(key);
          if (list) list.push(f);
          else buckets.set(key, [f]);
        }
      }
    }
    return { buckets };
  });
  return featurePromises[world]!;
}

/* ---------- Moon / Mars: elevation ---------- */

interface HeightMap {
  data: Uint8ClampedArray;
  w: number;
  h: number;
  toMetres: (v: number) => number;
}

const heightPromises: Partial<Record<World, Promise<HeightMap>>> = {};
function loadHeight(world: "moon" | "mars") {
  heightPromises[world] ??= new Promise<HeightMap>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      // 8-bit maps are the top byte of the 16-bit source grids (see textures/SOURCES_ELEVATION.txt).
      const toMetres =
        world === "moon"
          ? (v: number) => (v * 256 + 128) * 0.5 - 10000 // LOLA: half-metre units, offset 10 km
          : (v: number) => -8177 + ((v + 0.5) / 256) * (21171 + 8177); // MOLA: min..max stretched to 16 bits
      resolve({ data, w: c.width, h: c.height, toMetres });
    };
    img.onerror = reject;
    img.src = `/textures/${world}/height-2k.png`;
  });
  return heightPromises[world]!;
}

/* ---------- Public API ---------- */

export interface Lookup {
  (lat: number, lon: number): PlaceInfo;
}

/** Resolves to a synchronous lookup once this world's data has loaded. */
export async function createLookup(world: World): Promise<Lookup> {
  if (world === "earth") {
    const countries = await loadCountries();
    return (lat, lon) => {
      for (const c of countries) {
        if (inBounds(c.bounds, lon, lat) && geoContains(c.feature, [lon, lat])) return { label: c.name };
      }
      return { label: "Ocean" };
    };
  }

  const [index, height] = await Promise.all([loadFeatures(world), loadHeight(world)]);
  const radiusKm = WORLD_CONFIG[world].radiusKm;
  return (lat, lon) => {
    let best: NamedFeature | null = null;
    for (const f of index.buckets.get(bucketKey(lat, lon)) ?? []) {
      if (best && f.d >= best.d) continue;
      if (haversineKm({ lat, lon }, { lat: f.la, lon: f.lo }, radiusKm) <= f.d / 2) best = f;
    }
    const x = Math.min(height.w - 1, Math.floor(((lon + 180) / 360) * height.w));
    const y = Math.min(height.h - 1, Math.floor(((90 - lat) / 180) * height.h));
    const elevationM = Math.round(height.toMetres(height.data[(y * height.w + x) * 4]));
    return best ? { label: best.n, sublabel: `${best.t} · ${Math.round(best.d)} km`, elevationM } : { elevationM };
  };
}
