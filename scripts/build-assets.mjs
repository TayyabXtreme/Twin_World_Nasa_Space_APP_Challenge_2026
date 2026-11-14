#!/usr/bin/env node
/**
 * Asset pipeline: assets-raw/ (source, never shipped) → public/ (optimized).
 *
 *   npm run assets              build everything that is missing or stale
 *   npm run assets -- --force   rebuild everything
 *   npm run assets -- textures  run one step: textures | heightmaps | data | photos | models | audio
 *
 * Textures  → WebP tiers 1k / 2k / 4k per world
 * Heights   → 2k 8-bit PNG (runtime elevation/slope readout)
 * Data      → compact nomenclature + country topojson + detect-gpu benchmarks
 * Photos    → 1600w WebP + 480w thumb
 * Models    → meshopt-compressed GLB with WebP textures ≤ 1024 px (gltf-transform)
 * Audio     → mono 96 kbps MP3 / OGG (ffmpeg, if installed)
 */
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, "assets-raw");
const PUB = path.join(ROOT, "public");
const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));
const want = (step) => only.length === 0 || only.includes(step);

sharp.cache(false);
sharp.concurrency(2);

async function isStale(src, out) {
  if (FORCE) return true;
  try {
    const [s, o] = await Promise.all([stat(src), stat(out)]);
    return s.mtimeMs > o.mtimeMs;
  } catch {
    return true;
  }
}

async function ensureDir(file) {
  await mkdir(path.dirname(file), { recursive: true });
}

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

/** Resize an equirectangular map to 2:1 at each width and write WebP. */
async function webpTiers(src, outBase, widths, quality = 82) {
  for (const w of widths) {
    const label = w >= 1000 ? `${Math.round(w / 1024)}k` : `${w}`;
    const out = `${outBase}-${label}.webp`;
    if (!(await isStale(src, out))) continue;
    await ensureDir(out);
    await sharp(src, { limitInputPixels: false })
      .resize(w, w / 2, { fit: "fill", kernel: "lanczos3" })
      .webp({ quality, effort: 5 })
      .toFile(out);
    log("textures", `${path.relative(PUB, out)}  ${((await stat(out)).size / 1024).toFixed(0)} KB`);
  }
}

const T = (f) => path.join(RAW, "textures", f);
const TIERS = [1024, 2048, 4096];

async function textures() {
  const jobs = [
    [T("8k_earth_daymap.jpg"), "earth/day", TIERS],
    [T("8k_earth_nightmap.jpg"), "earth/night", TIERS],
    [T("8k_earth_clouds.jpg"), "earth/clouds", TIERS],
    [T("8k_earth_normal_map.jpg"), "earth/normal", TIERS, 62],
    [T("8k_earth_specular_map.jpg"), "earth/specular", TIERS],
    [T("moon-kit/moon_lroc_color_4k.jpg"), "moon/color", TIERS],
    [T("moon-kit/moon_normal_4k.jpg"), "moon/normal", TIERS, 62],
    [T("8k_mars.jpg"), "mars/color", TIERS],
    [T("mars-mola/mars_normal_4k.jpg"), "mars/normal", TIERS, 62],
    [T("8k_stars_milky_way.jpg"), "sky/milky-way", [2048, 4096]],
    [T("2k_sun.jpg"), "sky/sun", [1024]],
  ];
  // Normal maps are noisy and forgiving, so they get a lower WebP quality (62) than color maps (82).
  for (const [src, out, widths, quality] of jobs) await webpTiers(src, path.join(PUB, "textures", out), widths, quality);
}

async function heightmaps() {
  for (const [src, out] of [
    [T("moon-kit/moon_height_2k.png"), "moon/height-2k.png"],
    [T("mars-mola/mars_height_2k.png"), "mars/height-2k.png"],
  ]) {
    const dst = path.join(PUB, "textures", out);
    if (!(await isStale(src, dst))) continue;
    await ensureDir(dst);
    await sharp(src).greyscale().png({ compressionLevel: 9 }).toFile(dst);
    log("heightmaps", out);
  }
  await copyFile(T("mars-mola/mars_height_range.txt"), path.join(PUB, "textures", "mars", "height-range.txt"));
}

async function data() {
  const outDir = path.join(PUB, "data");
  await mkdir(outDir, { recursive: true });
  // detect-gpu benchmark tables, served locally instead of from unpkg (see lib/useQualityTier.ts).
  const benchSrc = path.join(ROOT, "node_modules/detect-gpu/dist/benchmarks");
  const benchDst = path.join(PUB, "detect-gpu");
  await mkdir(benchDst, { recursive: true });
  for (const f of await readdir(benchSrc)) await copyFile(path.join(benchSrc, f), path.join(benchDst, f));
  await copyFile(path.join(RAW, "data/geo/countries-50m.topo.json"), path.join(outDir, "countries-50m.topo.json"));
  await copyFile(path.join(RAW, "data/geo/countries-110m.topo.json"), path.join(outDir, "countries-110m.topo.json"));
  // Compact nomenclature: short keys, two tiers (≥100 km for hover at globe scale, ≥20 km when zoomed in).
  for (const world of ["moon", "mars"]) {
    const all = JSON.parse(await readFile(path.join(RAW, `data/nomenclature/${world}_features.json`), "utf8"));
    const compact = (f) => ({
      n: f.name,
      t: f.type.split(",")[0],
      la: f.lat,
      lo: f.lon,
      d: f.diameter_km ? Math.round(f.diameter_km * 10) / 10 : 0,
      o: f.origin,
    });
    const t1 = all.filter((f) => (f.diameter_km ?? 0) >= 100).map(compact);
    const t2 = all.filter((f) => (f.diameter_km ?? 0) >= 20 && (f.diameter_km ?? 0) < 100).map(compact);
    await writeFile(path.join(outDir, `${world}-features-t1.json`), JSON.stringify(t1));
    await writeFile(path.join(outDir, `${world}-features-t2.json`), JSON.stringify(t2));
    log("data", `${world}: tier1 ${t1.length}, tier2 ${t2.length}`);
  }
}

async function photos() {
  const dirs = ["photos/sites", "photos/twins", "photos/twins-nasa"];
  const skip = new Set(["katpana_cold_desert.jpg"]); // rights not verified — see docs/archive/plan.md §1.3
  for (const dir of dirs) {
    const abs = path.join(RAW, dir);
    for (const file of await readdir(abs)) {
      if (!/\.(jpe?g|png)$/i.test(file) || skip.has(file)) continue;
      const name = file.replace(/\.(jpe?g|png)$/i, "");
      const sub = path.basename(dir);
      for (const [w, suffix, q] of [
        [1600, "", 80],
        [480, ".thumb", 70],
      ]) {
        const out = path.join(PUB, "photos", sub, `${name}${suffix}.webp`);
        if (!(await isStale(path.join(abs, file), out))) continue;
        await ensureDir(out);
        await sharp(path.join(abs, file), { limitInputPixels: false })
          .rotate()
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: q })
          .toFile(out);
      }
      log("photos", `${sub}/${name}`);
    }
  }
}

/** "Lunar Reconnaissance Orbiter (A).glb" → "lunar-reconnaissance-orbiter-a.glb" (URL-safe). */
const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function models() {
  // Run the CLI through node directly (no shell), so file names with spaces work on Windows too.
  const cli = path.join(ROOT, "node_modules/@gltf-transform/cli/bin/cli.js");
  for (const file of await readdir(path.join(RAW, "models"))) {
    if (!file.endsWith(".glb")) continue;
    const src = path.join(RAW, "models", file);
    const out = path.join(PUB, "models", `${slug(file.replace(/\.glb$/, ""))}.glb`);
    if (!(await isStale(src, out))) continue;
    await ensureDir(out);
    execFileSync(
      process.execPath,
      [cli, "optimize", src, out, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "1024"],
      { stdio: "inherit" },
    );
    const before = (await stat(src)).size / 1e6;
    const after = (await stat(out)).size / 1e6;
    log("models", `${path.basename(out)}: ${before.toFixed(1)} MB → ${after.toFixed(1)} MB`);
  }
}

async function audio() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    log("audio", "ffmpeg not found — skipping");
    return;
  }
  const keepUi = ["click_002", "select_002", "open_001", "close_001", "toggle_001", "error_002", "confirmation_001", "glitch_002", "maximize_003"];
  const jobs = [
    ...["ambient", "boot", "correct", "wrong", "rover", "scan", "warp"].map((n) => [path.join(RAW, "audio", `${n}.mp3`), `${n}.mp3`, "96k"]),
    ...keepUi.map((n) => [path.join(RAW, "audio/interface_sound", `${n}.ogg`), `ui/${n}.ogg`, "64k"]),
  ];
  for (const [src, rel, bitrate] of jobs) {
    const out = path.join(PUB, "audio", rel);
    if (!(await isStale(src, out))) continue;
    await ensureDir(out);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-ac", "1", "-b:a", bitrate, out]);
    log("audio", `${rel}  ${((await stat(out)).size / 1024).toFixed(0)} KB`);
  }
}

const steps = { textures, heightmaps, data, photos, models, audio };
for (const [name, fn] of Object.entries(steps)) {
  if (want(name)) await fn();
}
console.log("✓ assets ready");
