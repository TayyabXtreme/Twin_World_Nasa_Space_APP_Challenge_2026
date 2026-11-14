import { readFile } from "node:fs/promises";
import path from "node:path";
import { geoBounds, geoContains } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { DATASETS as CATALOGUE } from "@/lib/data/datasets";
import { STATIC_PLACES } from "@/lib/data/globePlaces";
import { landingById } from "@/lib/data/landings";
import { measured, METRIC_INFO, metricsFor, type MetricKey } from "@/lib/data/metrics";
import { siteById, SITES } from "@/lib/data/sites";
import { twinsForSite } from "@/lib/data/twins";
import { cellResult, decodeGrid, scoreAll, scoreRanker, topPlaces, type Grid } from "@/lib/finder/model";
import { distinctLabels } from "@/lib/finder/places";
import { DEFAULT_WEIGHTS } from "@/lib/finder/text";
import { DIM_IDS, type DimId, type GridHeader, type TargetsDoc, type Weights } from "@/lib/finder/types";
import type { Lookup } from "@/lib/lookup";
import { valueAtLatLon } from "@/lib/moonbase/grids";
import { decodeGreyPng } from "@/lib/moonbase/png";
import { ARTEMIS_REGIONS } from "@/lib/moonbase/regions";
import { toXY } from "@/lib/moonbase/projection";
import type { Grid as MoonGrid, Manifest } from "@/lib/moonbase/types";
import { FACTOR_INFO, MISSIONS, scoreSite, type Mission } from "@/lib/score";
import type { World } from "@/lib/worlds";

/**
 * TwinWorlds' data tools, run on the server from the same files the site serves (public/data). Rovi's brain calls
 * them (lib/rovi/server/brain.ts) and the planned MCP server can reuse them: one source of truth for every number.
 * Results are deliberately compact (rounded, top few rows) so they cost few tokens.
 */

const PUBLIC = path.join(process.cwd(), "public");
const read = (p: string) => readFile(path.join(PUBLIC, p));
const json = async <T>(p: string) => JSON.parse((await read(p)).toString("utf8")) as T;
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** Throw this for bad input; the brain returns it to the model as an error result instead of failing the turn. */
export class ToolInputError extends Error {}

/* ---------- list_sites ---------- */

export function listSites(world?: World) {
  return SITES.filter((s) => !world || s.world === world).map((s) => ({
    id: s.id,
    name: s.name,
    world: s.world,
    region: s.region,
    kind: s.kind,
    evidence: s.evidence,
  }));
}

/* ---------- find_analogues: the Analog Finder, server side ---------- */

let finder: Promise<{ header: GridHeader; targets: TargetsDoc; grid: Grid; scores: Float32Array }> | null = null;
function loadFinder() {
  finder ??= Promise.all([
    json<GridHeader>("data/finder/earth-grid.json"),
    json<TargetsDoc>("data/finder/targets.json"),
    read("data/finder/earth-core.bin"),
  ]).then(([header, targets, core]) => {
    const grid = decodeGrid(header, core.buffer.slice(core.byteOffset, core.byteOffset + core.byteLength) as ArrayBuffer);
    return { header, targets, grid, scores: new Float32Array(grid.n) };
  });
  return finder;
}

/** Country lookup for Earth labels: the same 1:110m outlines the browser uses (lib/lookup.ts), read from disk. */
let countries: Promise<Lookup> | null = null;
function loadCountries() {
  countries ??= json<Topology>("data/countries-110m.topo.json").then((topo) => {
    const fc = feature(topo, topo.objects.countries) as unknown as { features: Feature<Geometry, { name: string }>[] };
    const list = fc.features.map((f) => ({ name: f.properties.name, f, b: geoBounds(f) }));
    return (lat: number, lon: number) => {
      for (const c of list) {
        const [[x0, y0], [x1, y1]] = c.b;
        const inLon = x0 <= x1 ? lon >= x0 && lon <= x1 : lon >= x0 || lon <= x1;
        if (lat >= y0 && lat <= y1 && inLon && geoContains(c.f, [lon, lat])) return { label: c.name };
      }
      return { label: "Ocean" };
    };
  });
  return countries;
}

export async function findAnalogues(targetId: string, weights?: Partial<Record<DimId, number>>, top = 5) {
  const [{ header, targets, grid, scores }, lookup] = await Promise.all([loadFinder(), loadCountries()]);
  const target = targets.targets.find((t) => t.id === targetId);
  if (!target) throw new ToolInputError(`Unknown target "${targetId}". Valid: ${targets.targets.map((t) => t.id).join(", ")}`);
  const w: Weights = { ...DEFAULT_WEIGHTS[target.world], ...weights };
  const luts = scoreAll(grid, target, w, scores);
  const { topPct, scoreAtTop } = scoreRanker(grid, scores);
  const picks = topPlaces(grid, scores, scoreAtTop(0.04)).slice(0, Math.min(8, Math.max(1, top)));
  const cells = picks.map((i) => cellResult(grid, target, luts, scores, topPct, i));
  const labels = distinctLabels(cells, lookup);
  return {
    target: { id: target.id, name: target.name, world: target.world },
    cellsScored: header.grid.cells,
    gridDeg: header.grid.res,
    weights: Object.fromEntries(DIM_IDS.filter((d) => target.dims[d]).map((d) => [d, w[d]])),
    matches: cells.map((c, i) => ({
      rank: i + 1,
      place: labels[i].title,
      detail: labels[i].subtitle,
      lat: round(c.lat, 2),
      lon: round(c.lon, 2),
      score: Math.round(c.score * 100),
      // Share of Earth's land area that scores higher than this place.
      landScoringHigher: c.topPct < 0.01 ? "under 0.01%" : `${round(c.topPct, 2)}%`,
      bestMatchingFactors: (Object.entries(c.sims) as [DimId, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([d, s]) => `${d} ${Math.round(s * 100)}%`),
    })),
    note: "Score 0–100 = similarity of measured conditions for their world, never an exact match.",
  };
}

/* ---------- sample_moon_point: every LRO layer at one south-pole point ---------- */

let moon: Promise<{ manifest: Manifest; grids: { id: string; label: string; units: string; decimals: number; grid: MoonGrid }[] }> | null = null;
function loadMoon() {
  moon ??= json<Manifest>("data/moonbase/manifest.json").then(async (manifest) => {
    const ready = manifest.layers.filter((l) => l.status === "ready" && l.grid);
    const grids = await Promise.all(
      ready.map(async (l) => {
        const buf = await read(`data/moonbase/${l.grid!.file}`);
        const png = await decodeGreyPng(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
        return { id: l.id, label: l.label, units: l.units, decimals: l.decimals, grid: { size: png.width, dn: png.data, meta: l.grid! } };
      }),
    );
    return { manifest, grids };
  });
  return moon;
}

export async function sampleMoonPoint(lat: number, lon: number) {
  if (lat > -75 || lat < -90) throw new ToolInputError("The Moon Base map covers 75°S to 90°S only (lat between -90 and -75).");
  const { grids } = await loadMoon();
  const values: Record<string, string> = {};
  for (const g of grids) {
    const v = valueAtLatLon(g.grid, lat, lon);
    values[g.label] =
      v === null ? "no data" : v === "none" ? "no stable ice within 2.87 m" : `${round(v, g.decimals)} ${g.units}`;
  }
  const [x, y] = toXY(lat, lon);
  const nearest = ARTEMIS_REGIONS.map((r) => ({ r, km: Math.hypot(r.x - x, r.y - y) })).sort((a, b) => a.km - b.km)[0];
  return {
    point: { lat: round(lat, 3), lon: round(lon, 3) },
    values,
    nearestArtemisIIIRegion: {
      id: nearest.r.id,
      name: nearest.r.name,
      distanceKm: Math.round(nearest.km),
      inside: nearest.km <= nearest.r.radiusKm,
    },
    source: "NASA LRO (LOLA, Diviner, Mini-RF, LEND) grids in public/data/moonbase; region centres are approximate.",
  };
}

/** Artemis III region centres, for "put a base at X" questions. */
export function artemisRegions() {
  return ARTEMIS_REGIONS.map((r) => ({ id: r.id, name: r.name, lat: round(r.lat, 2), lon: round(r.lon, 2), note: r.note }));
}

/* ---------- score_site: the Mission Score ---------- */

export function scoreSiteTool(siteId: string, mission: Mission) {
  const site = siteById(siteId);
  if (!site) throw new ToolInputError(`Unknown site "${siteId}". Call list_sites for valid ids.`);
  if (site.world === "earth") throw new ToolInputError("Mission scores are for Moon and Mars sites; Earth sites are analogues.");
  const { score, rows } = scoreSite(site, MISSIONS[mission].weights);
  return {
    site: site.name,
    mission: MISSIONS[mission].label,
    score,
    scale: "0–100, weighted mean of the factors below",
    factors: rows
      .sort((a, b) => b.weight - a.weight)
      .map((r) => ({
        factor: FACTOR_INFO[r.id].label,
        value: Math.round(r.value * 100),
        weightPct: Math.round(r.weight * 100),
        basis: r.basis,
        confidence: r.confidence,
        why: r.why,
      })),
  };
}

/* ---------- compare_sites ---------- */

function siteCard(id: string) {
  const s = siteById(id);
  if (!s) {
    const l = landingById(id);
    if (l) return { id, name: l.mission, world: l.world, summary: l.summary, measured: {} };
    throw new ToolInputError(`Unknown site "${id}". Call list_sites for valid ids.`);
  }
  const m = metricsFor(id);
  const out: Record<string, string> = {};
  for (const key of Object.keys(m) as MetricKey[]) {
    const v = measured(id, key);
    if (v) out[METRIC_INFO[key].label] = `${round(v.value, METRIC_INFO[key].digits)} ${v.units} (${v.dataset})`;
  }
  return {
    id,
    name: s.name,
    world: s.world,
    region: s.region,
    summary: s.summary,
    landforms: s.landforms,
    hazards: s.hazards,
    elevationM: s.elevationM,
    measured: out,
    evidence: s.evidence,
  };
}

export function compareSites(a: string, b: string) {
  const A = siteCard(a);
  const B = siteCard(b);
  const link = twinsForSite(a).find((t) => t.earthId === b || t.otherId === b);
  return {
    a: A,
    b: B,
    twinLink: link
      ? { feature: link.feature, shared: link.shared, differences: link.differences, nasaUse: link.nasaUse, proposed: Boolean(link.proposed) }
      : null,
    reminder: "Analogues match one feature at a time; gravity, air and radiation always differ between worlds.",
  };
}

/* ---------- get_dataset ---------- */

export function getDataset(query: string) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  const scored = CATALOGUE.map((d) => {
    const hay = `${d.id} ${d.badge} ${d.name} ${d.mission} ${d.instrument} ${d.agency}`.toLowerCase();
    return { d, hits: d.id === q ? 99 : words.filter((w) => hay.includes(w)).length };
  })
    .filter((x) => x.hits > 0)
    .sort((x, y) => y.hits - x.hits)
    .slice(0, 3);
  if (!scored.length) throw new ToolInputError(`No dataset matches "${query}".`);
  return scored.map(({ d }) => ({
    id: d.id,
    name: d.name,
    agency: d.agency,
    mission: d.mission,
    instrument: d.instrument,
    measures: d.measures,
    resolution: d.resolution,
    coverage: d.coverage,
    usedBy: d.usedBy,
    caveats: d.caveats.slice(0, 2),
    url: d.sourceUrl,
  }));
}

export const MISSION_IDS = Object.keys(MISSIONS) as Mission[];

/* ---------- facts returned with screen actions, so Rovi can talk about what it just showed ---------- */

/** What the card for a globe pin says (site, Earth place or landing). */
export function pinFacts(id: string) {
  const s = siteById(id);
  if (s) return { name: s.name, region: s.region, world: s.world, summary: s.summary, evidence: s.evidence };
  const l = landingById(id);
  if (l) return { name: l.mission, craft: l.craft, date: l.date, site: l.site, world: l.world, summary: l.summary };
  const p = STATIC_PLACES.find((x) => x.id === id);
  if (p) return { name: p.name, region: p.region, summary: p.summary, facts: p.facts.slice(0, 3) };
  throw new ToolInputError(`Unknown pin "${id}".`);
}

export function regionFacts(id: string) {
  const r = ARTEMIS_REGIONS.find((x) => x.id === id);
  if (!r) throw new ToolInputError(`Unknown Artemis III region "${id}".`);
  return { name: r.name, note: r.note, approxCentre: { lat: round(r.lat, 2), lon: round(r.lon, 2) } };
}

/** A map layer's legend: title, units, range and what it means (public/data/layers/<id>.json, science layers only). */
export async function layerFacts(id: string) {
  try {
    const l = await json<{ title: string; units?: string; range?: [number, number]; meaning?: string; caveat?: string; dataset?: string }>(`data/layers/${id}.json`);
    return { title: l.title, units: l.units, range: l.range, meaning: l.meaning, caveat: l.caveat, dataset: l.dataset };
  } catch {
    return { title: id, note: "Base map imagery; no value legend." };
  }
}
