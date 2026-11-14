// Mission Challenge images: game photos (cropped to the 16:10 game frame) and one card image per game.
// Inputs come from assets-raw/photos (fetch-challenge-photos.py for the NASA ones). Run: node scripts/build-challenge.mjs

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "assets-raw", "photos");
const OUT = path.join(ROOT, "public", "photos", "challenge");
mkdirSync(OUT, { recursive: true });

/** slug, source (relative to assets-raw/photos), focus point (0..1) the 16:10 crop centres on, optional zoom (< 1 trims mosaic edges) */
const PHOTOS = [
  ["mars-gusev-ripples", "challenge/PIA03274.jpg", 0.5, 0.4, 0.82],
  ["mars-mount-sharp-buttes", "challenge/PIA19083.jpg", 0.5, 0.5],
  ["mars-endeavour-rim", "challenge/PIA19109.jpg", 0.45, 0.4, 0.84],
  ["mars-namib-dune", "challenge/PIA20281.jpg", 0.42, 0.5],
  ["mars-murray-buttes", "challenge/PIA21043.jpg", 0.5, 0.45],
  ["moon-hadley-rille", "challenge/as15-85-11425.jpg", 0.5, 0.45],
  ["moon-hadley-telephoto", "challenge/as15-89-12100.jpg", 0.5, 0.5],
  ["moon-descartes-boulder", "challenge/as16-114-18412.jpg", 0.5, 0.55],
  ["moon-descartes-station1", "challenge/as16-114-18421.jpg", 0.5, 0.55],
  ["moon-orange-soil", "challenge/as17-137-20989.jpg", 0.5, 0.5],
  ["earth-mcmurdo", "twins/mcmurdo_dry_valleys.jpg", 0.5, 0.55],
  ["earth-iceland-lava", "twins/iceland_volcanic_landscape.jpg", 0.5, 0.62],
  ["earth-iceland-artemis", "twins-nasa/iceland_artemis2_geology_training.jpg", 0.5, 0.5],
  ["earth-hingol", "twins/hingol_mud_volcanoes.jpg", 0.5, 0.5],
  ["earth-devon-camp", "challenge/ARC-2007-ACD07-0170-004.jpg", 0.5, 0.55],
  ["earth-devon-drill-hill", "challenge/ARC-2007-ACD07-0170-006.jpg", 0.5, 0.55],
];

const CARDS = [
  ["card-scout", "../../public/landing/moon-pole.webp", 0.5, 0.42],
  ["card-touchdown", "challenge/as16-107-17436.jpg", 0.5, 0.42],
  ["card-rover", "challenge/PIA24542.jpg", 0.55, 0.5],
  ["card-launch", "challenge/NHQ202211160030.jpg", 0.5, 0.35],
];

/** Crop the largest `aspect` window centred (as far as possible) on the focus point. */
async function crop(src, aspect, fx, fy, zoom = 1) {
  const img = sharp(path.join(RAW, src)).rotate();
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
  return { img: img.extract({ left, top, width: cw, height: ch }), cw, ch };
}

for (const [slug, src, fx, fy, zoom] of PHOTOS) {
  const { img, cw, ch } = await crop(src, 16 / 10, fx, fy, zoom);
  const buf = await img.toBuffer();
  const width = Math.min(1600, cw);
  await sharp(buf).resize(width).webp({ quality: 80 }).toFile(path.join(OUT, `${slug}.webp`));
  await sharp(buf).resize(480).webp({ quality: 72 }).toFile(path.join(OUT, `${slug}.thumb.webp`));
  console.log(`${slug.padEnd(26)} ${cw}x${ch} -> ${width}px${cw < 900 ? "  (low resolution source)" : ""}`);
}

for (const [slug, src, fx, fy] of CARDS) {
  const { img } = await crop(src, 16 / 10, fx, fy);
  await img.resize(1200, 750).modulate({ brightness: 0.95 }).webp({ quality: 76 }).toFile(path.join(OUT, `${slug}.webp`));
  console.log(`${slug}`);
}

// "Earth or Elsewhere?" card: Iceland (Earth) and Mount Sharp (Mars) meeting on a diagonal.
const W = 1200;
const H = 750;
const earth = await (await crop("twins-nasa/iceland_artemis2_geology_training.jpg", W / H, 0.5, 0.5)).img.resize(W, H).toBuffer();
const mars = await (await crop("challenge/PIA19083.jpg", W / H, 0.5, 0.5)).img.resize(W, H).toBuffer();
const mask = Buffer.from(`<svg width="${W}" height="${H}"><polygon points="${W * 0.58},0 ${W},0 ${W},${H} ${W * 0.42},${H}" fill="#fff"/></svg>`);
const marsHalf = await sharp(mars).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
const seam = Buffer.from(
  `<svg width="${W}" height="${H}"><line x1="${W * 0.58}" y1="0" x2="${W * 0.42}" y2="${H}" stroke="#fff" stroke-opacity="0.85" stroke-width="3"/></svg>`,
);
await sharp(earth).composite([{ input: marsHalf }, { input: seam }]).webp({ quality: 78 }).toFile(path.join(OUT, "card-guess.webp"));
console.log("card-guess");
