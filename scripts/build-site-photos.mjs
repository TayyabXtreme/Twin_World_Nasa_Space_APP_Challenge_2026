// Headline photos for the Earth analogue sites added on 2026-11-14 (Compare, globe, site drawer).
// Inputs: assets-raw/photos/sites-earth (NASA Image Library via scripts/fetch-site-photos.py, plus NASA GIBS
// snapshots gibs-*.jpg: HLS Sentinel-2/Landsat 30 m and MODIS true colour) and a few photos already in
// public/. Output: public/photos/sites-earth/<site>.webp + .thumb.webp (16:10 crops).
// Run: node scripts/build-site-photos.mjs

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "assets-raw", "photos", "sites-earth");
const OUT = path.join(ROOT, "public", "photos", "sites-earth");
mkdirSync(OUT, { recursive: true });

/** site slug, source file, focus point (0..1) for the 16:10 crop, optional zoom (< 1 crops tighter) */
const PHOTOS = [
  ["devon-haughton", path.join(ROOT, "assets-raw", "photos", "challenge", "ARC-2007-ACD07-0170-006.jpg"), 0.5, 0.55],
  ["mauna-kea", path.join(ROOT, "public", "photos", "places", "pisces.webp"), 0.45, 0.5],
  ["craters-of-the-moon", path.join(RAW, "gibs-craters.jpg"), 0.5, 0.5, 0.85],
  ["meteor-crater", path.join(RAW, "gibs-meteor.jpg"), 0.5, 0.5, 0.9],
  ["black-point", path.join(ROOT, "public", "photos", "places", "desert-rats.webp"), 0.5, 0.5],
  ["mdrs", path.join(RAW, "gibs-mdrs.jpg"), 0.5, 0.5, 0.85],
  ["svalbard-bockfjorden", path.join(RAW, "PIA24048.jpg"), 0.5, 0.5],
  ["dome-c", path.join(RAW, "gibs-concordia.jpg"), 0.5, 0.5],
  ["rio-tinto", path.join(RAW, "PIA13365.jpg"), 0.5, 0.5, 0.7],
  ["lanzarote", path.join(RAW, "PIA23526.jpg"), 0.5, 0.5],
  ["teide", path.join(RAW, "iss013e23272.jpg"), 0.5, 0.5],
  ["dallol", path.join(RAW, "gibs-dallol.jpg"), 0.5, 0.5, 0.9],
  ["namib", path.join(RAW, "PIA17632.jpg"), 0.5, 0.5],
  ["uyuni", path.join(RAW, "iss074e0319935.jpg"), 0.5, 0.5],
  ["ladakh", path.join(RAW, "gibs-ladakh.jpg"), 0.5, 0.5, 0.9],
  ["pilbara", path.join(RAW, "PIA23551.jpg"), 0.5, 0.45],
  ["wadi-rum", path.join(RAW, "GSFC_20171208_Archive_e001903.jpg"), 0.5, 0.5],
  ["victoria-land", path.join(RAW, "gibs-victoria.jpg"), 0.3, 0.45, 0.85],
];

async function crop(src, aspect, fx, fy, zoom = 1) {
  const img = sharp(src).rotate();
  const { width: w, height: h } = await img.metadata();
  let cw = w;
  let ch = Math.round(w / aspect);
  if (ch > h) {
    ch = h;
    cw = Math.round(h * aspect);
  }
  cw = Math.round(cw * zoom);
  ch = Math.round(ch * zoom);
  const left = Math.round(Math.min(w - cw, Math.max(0, fx * w - cw / 2)));
  const top = Math.round(Math.min(h - ch, Math.max(0, fy * h - ch / 2)));
  return { buf: await img.extract({ left, top, width: cw, height: ch }).toBuffer(), cw, ch };
}

for (const [slug, src, fx, fy, zoom] of PHOTOS) {
  const { buf, cw, ch } = await crop(src, 16 / 10, fx, fy, zoom);
  const width = Math.min(1400, cw);
  await sharp(buf).resize(width).webp({ quality: 80 }).toFile(path.join(OUT, `${slug}.webp`));
  await sharp(buf).resize(360).webp({ quality: 72 }).toFile(path.join(OUT, `${slug}.thumb.webp`));
  console.log(`${slug.padEnd(22)} ${cw}x${ch} -> ${width}px${cw < 700 ? "  (low resolution source)" : ""}`);
}
