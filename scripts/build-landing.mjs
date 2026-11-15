// Landing page showcase data: real Analog Finder results and a Moon south-pole image, precomputed so the landing
// page stays light. Re-run after the Finder or Moon base data change:  node scripts/build-landing.mjs
//
// Outputs
//   public/landing/finder-<target>.webp      Earth match heat map (the Finder's own scorer and colours)
//   public/landing/moon-pole.webp            LOLA shaded relief with Diviner cold traps on top
//   lib/data/landing.generated.json          top places, known-analogue ranks and image paths

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geoContains } from "d3-geo";
import sharp from "sharp";
import { feature } from "topojson-client";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = (...p) => path.join(ROOT, ...p);
const OUT_IMG = at("public", "landing");
mkdirSync(OUT_IMG, { recursive: true });

// 1. Compile the Finder's scorer (TypeScript, browser code) to CommonJS so this script runs the exact same maths.
const build = mkdtempSync(path.join(tmpdir(), "twinworlds-landing-"));
for (const name of ["types", "params", "model", "scorer"]) {
  const src = readFileSync(at("lib", "finder", `${name}.ts`), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  writeFileSync(path.join(build, `${name}.js`), js);
}
copyFileSync(at("lib", "finder", "params.generated.json"), path.join(build, "params.generated.json"));
// The scorer paints into ImageData; Node has none, and no OffscreenCanvas, so it hands back the raw pixels.
globalThis.ImageData = class {
  constructor(data, width, height) {
    Object.assign(this, { data, width, height });
  }
};
const load = createRequire(import.meta.url);
const { createScorer } = load(path.join(build, "scorer.js"));
const { DEFAULT_WEIGHTS, withParams } = load(path.join(build, "params.js"));

// 2. Data (the thirteen-parameter grid), the Finder's own default weights and country outlines.
const readJson = (...p) => JSON.parse(readFileSync(at(...p), "utf8"));
const header = readJson("public", "data", "finder", "earth-grid.json");
const params = readJson("public", "data", "finder", "earth-params.json");
const targetsDoc = withParams(readJson("public", "data", "finder", "targets.json"));
const binBuf = readFileSync(at("public", "data", "finder", "earth-params.bin"));
const bin = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.length);
const weightsFor = (world) => DEFAULT_WEIGHTS[world];

const topo = readJson("public", "data", "countries-50m.topo.json");
const countries = feature(topo, topo.objects.countries).features;
const countryAt = (lat, lon) => countries.find((f) => geoContains(f, [lon, lat]))?.properties.name ?? "Open land";

// NASA-recognised analogues, scored the same way the Finder's sanity check does (best cell within 50 km).
const KNOWN = [
  { id: "atacama", name: "Atacama Desert", lat: -24.5, lon: -69.25 },
  { id: "mcmurdo", name: "McMurdo Dry Valleys", lat: -77.5, lon: 162.0 },
  { id: "devon", name: "Devon Island", lat: 75.38, lon: -89.68 },
  { id: "hingol", name: "Hingol, Pakistan", lat: 25.6, lon: 65.5 },
].map((k) => ({ ...k, radiusKm: 50 }));
const scorer = createScorer(header, params, bin, KNOWN);

const SHOWCASE = [
  { id: "mars-jezero", blurb: "Dry, salty, oxidised ground where Perseverance looks for signs of ancient life." },
  { id: "mars-phoenix", blurb: "Ice-cemented polar soil, the first place a lander touched Martian water ice." },
  { id: "moon-shackleton-rim", blurb: "The lunar south pole: sunlit ridges beside craters that never see the Sun." },
];

// Earth base map, dimmed so the match colours carry the image.
const base = await sharp(at("public", "textures", "earth", "day-2k.webp"))
  .resize(header.grid.nx, header.grid.ny)
  .grayscale()
  .linear(0.42, 2)
  .tint("#5b6f99")
  .removeAlpha()
  .png()
  .toBuffer();

const targets = [];
for (const s of SHOWCASE) {
  const target = targetsDoc.targets.find((t) => t.id === s.id);
  if (!target) throw new Error(`No Finder target ${s.id}`);
  const r = await scorer.score(1, target, weightsFor(target.world));
  const { data, width, height } = r.heat;
  const file = `finder-${s.id}.webp`;
  // Same pixels the Finder draws, plus a soft glow of them so the best matches read at landing-page size.
  const heat = await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } }).png().toBuffer();
  const glow = await sharp(heat).blur(5).png().toBuffer();
  await sharp(base)
    .composite([
      { input: glow, blend: "screen" },
      { input: glow, blend: "screen" },
      { input: heat, blend: "over" },
    ])
    .webp({ quality: 76 })
    .toFile(path.join(OUT_IMG, file));

  targets.push({
    id: s.id,
    name: target.name,
    world: target.world,
    blurb: s.blurb,
    image: `/landing/${file}`,
    top: r.top.slice(0, 5).map((c) => ({
      lat: +c.lat.toFixed(2),
      lon: +c.lon.toFixed(2),
      country: countryAt(c.lat, c.lon),
      topPct: +c.topPct.toFixed(2),
    })),
    known: KNOWN.map((k) => ({ name: k.name, topPct: r.refs[k.id] ? +r.refs[k.id].topPct.toFixed(1) : null })),
  });
  console.log(`${target.name}: ${targets.at(-1).top.map((p) => p.country).join(", ")}`);
}

// 3. Moon south pole: LOLA shaded relief with Diviner cold traps laid over it.
const moon = readJson("public", "data", "moonbase", "manifest.json");
const SIZE = 1000;
const relief = await sharp(at("public", "data", "moonbase", "elevation.webp")).resize(SIZE, SIZE).modulate({ brightness: 0.9 }).toBuffer();
const traps = await sharp(at("public", "data", "moonbase", "coldtrap.webp")).resize(SIZE, SIZE).ensureAlpha().toBuffer();
await sharp(relief)
  .composite([{ input: traps }])
  .webp({ quality: 72 })
  .toFile(path.join(OUT_IMG, "moon-pole.webp"));

const layers = Object.fromEntries(moon.layers.map((l) => [l.id, l]));
const out = {
  generated: new Date().toISOString(),
  note: "Built by scripts/build-landing.mjs from the Analog Finder grid and the Moon base layers.",
  earthCells: header.grid.cells,
  finder: targets,
  moon: {
    image: "/landing/moon-pole.webp",
    halfWidthKm: moon.grid.halfWidthM / 1000,
    datasets: [layers.elevation.dataset.name, layers.coldtrap.dataset.name],
    regions: moon.regions.map(({ id, name, lat, lon, approximate }) => ({ id, name, lat, lon, approximate })),
    features: moon.features.map(({ id, name, lat, lon }) => ({ id, name, lat, lon })),
  },
};
writeFileSync(at("lib", "data", "landing.generated.json"), JSON.stringify(out, null, 2) + "\n");
console.log("wrote lib/data/landing.generated.json and public/landing/*.webp");
